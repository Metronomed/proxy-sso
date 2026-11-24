/**
 * @file Tests for the account rules
 */

import {
  findProxyAccount,
  linkProxyAccount,
  unlinkProxyAccount,
  type IProxyAccount,
  type IProxyAccountStore,
} from "./accounts.js";

/** In-memory account with an email. */
interface ITestAccount extends IProxyAccount {
  /** Primary key. */
  id: number;
  /** Lowercased account email. */
  email: string;
}

/** An array-backed store and its rows. */
interface ITestStore {
  /** The store under test. */
  store: IProxyAccountStore<ITestAccount>;
  /** Backing rows. */
  accounts: ITestAccount[];
  /** Adds an account and returns it. */
  add: (email: string, proxySub?: string | null, isDeactivated?: boolean) => ITestAccount;
}

/**
 * Builds an empty store that behaves like a SQL adapter.
 * @returns the store and helpers
 */
function createStore(): ITestStore {
  const accounts: ITestAccount[] = [];
  const store: IProxyAccountStore<ITestAccount> = {
    findBySub: (sub) => accounts.find((account) => account.proxySub === sub),
    findByEmail: (email) => accounts.find((account) => account.email === email),
    linkSubIfUnlinked: (accountId, sub) => {
      const account = accounts.find((row) => row.id === accountId);
      if (account?.proxySub !== null) return false;
      account.proxySub = sub;
      return true;
    },
    unlinkSub: (accountId) => {
      const account = accounts.find((row) => row.id === accountId);
      if (!account?.proxySub) return false;
      account.proxySub = null;
      return true;
    },
  };
  const add = (email: string, proxySub: string | null = null, isDeactivated = false) => {
    const account = { id: accounts.length + 1, email, proxySub, isDeactivated };
    accounts.push(account);
    return account;
  };
  return { store, accounts, add };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("findProxyAccount", () => {
  it("matches a linked subject even when the email differs", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-alice");
    const found = await findProxyAccount(store, { sub: "sub-alice", email: "alice@idp.example" });
    expect(found?.id).toBe(alice.id);
  });

  it("prefers the linked account over an email match", async () => {
    const { store, add } = createStore();
    add("alice@idp.example");
    const linked = add("alice@app.example", "sub-alice");
    const found = await findProxyAccount(store, { sub: "sub-alice", email: "alice@idp.example" });
    expect(found?.id).toBe(linked.id);
  });

  it("falls back to an email match for an unlinked subject", async () => {
    const { store, add } = createStore();
    const alice = add("alice@example.com");
    const found = await findProxyAccount(store, { sub: "sub-new", email: "alice@example.com" });
    expect(found?.id).toBe(alice.id);
  });

  it("ignores an email match on an account linked to a different subject", async () => {
    const { store, add } = createStore();
    add("alice@example.com", "sub-original");
    const found = await findProxyAccount(store, { sub: "sub-other", email: "alice@example.com" });
    expect(found).toBeUndefined();
  });

  it("skips a deactivated linked account rather than falling back to email", async () => {
    const { store, add } = createStore();
    add("alice@app.example", "sub-alice", true);
    add("alice@idp.example");
    const found = await findProxyAccount(store, { sub: "sub-alice", email: "alice@idp.example" });
    expect(found).toBeUndefined();
  });

  it("skips a deactivated email match", async () => {
    const { store, add } = createStore();
    add("alice@example.com", null, true);
    const found = await findProxyAccount(store, { sub: "sub-new", email: "alice@example.com" });
    expect(found).toBeUndefined();
  });

  it("matches nothing for an unlinked subject without an email", async () => {
    const { store, add } = createStore();
    add("alice@example.com");
    expect(await findProxyAccount(store, { sub: "sub-new", email: undefined })).toBeUndefined();
  });

  it("warns when nothing matches", async () => {
    const { store } = createStore();
    expect(await findProxyAccount(store, { sub: "sub-new", email: undefined })).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("no active account"));
  });

  it("works with an async store", async () => {
    const { store, add } = createStore();
    const alice = add("alice@example.com");
    const asyncStore: IProxyAccountStore<typeof alice> = {
      findBySub: (sub) => Promise.resolve(store.findBySub(sub)),
      findByEmail: (email) => Promise.resolve(store.findByEmail(email)),
      linkSubIfUnlinked: (id, sub) => Promise.resolve(store.linkSubIfUnlinked(id, sub)),
      unlinkSub: (id) => Promise.resolve(store.unlinkSub(id)),
    };
    const found = await findProxyAccount(asyncStore, { sub: "s", email: "alice@example.com" });
    expect(found?.id).toBe(alice.id);
  });
});

describe("linkProxyAccount", () => {
  it("links an identity that reaches no other account", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example");
    const identity = { sub: "sub-alice", email: "alice@idp.example" };
    expect(await linkProxyAccount(store, alice.id, identity)).toBe(true);
    expect(alice.proxySub).toBe("sub-alice");
  });

  it("links an identity without an email", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example");
    expect(await linkProxyAccount(store, alice.id, { sub: "sub-alice", email: undefined })).toBe(
      true,
    );
    expect(alice.proxySub).toBe("sub-alice");
  });

  it("links an identity whose email matches the same account", async () => {
    const { store, add } = createStore();
    const alice = add("alice@example.com");
    const identity = { sub: "sub-alice", email: "alice@example.com" };
    expect(await linkProxyAccount(store, alice.id, identity)).toBe(true);
    expect(alice.proxySub).toBe("sub-alice");
  });

  it("refuses an identity whose email matches another account", async () => {
    const { store, add } = createStore();
    const alice = add("alice@idp.example");
    const bob = add("bob@app.example");
    const identity = { sub: "sub-alice", email: "alice@idp.example" };
    expect(await linkProxyAccount(store, bob.id, identity)).toBe(false);
    expect(bob.proxySub).toBeNull();
    expect((await findProxyAccount(store, identity))?.id).toBe(alice.id);
  });

  it("refuses an identity whose email matches a deactivated account", async () => {
    const { store, add } = createStore();
    add("old@idp.example", null, true);
    const current = add("new@app.example");
    const identity = { sub: "sub-old", email: "old@idp.example" };
    expect(await linkProxyAccount(store, current.id, identity)).toBe(false);
  });

  it("never moves a subject already linked to another account", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-alice");
    const bob = add("bob@app.example");
    expect(await linkProxyAccount(store, bob.id, { sub: "sub-alice", email: undefined })).toBe(
      false,
    );
    expect(alice.proxySub).toBe("sub-alice");
    expect(bob.proxySub).toBeNull();
  });

  it("never moves a subject linked to a deactivated account", async () => {
    const { store, add } = createStore();
    const old = add("alice@old.example", "sub-alice", true);
    const current = add("alice@app.example");
    expect(await linkProxyAccount(store, current.id, { sub: "sub-alice", email: undefined })).toBe(
      false,
    );
    expect(old.proxySub).toBe("sub-alice");
    expect(current.proxySub).toBeNull();
  });

  it("never replaces an account's existing link", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-old");
    expect(await linkProxyAccount(store, alice.id, { sub: "sub-new", email: undefined })).toBe(
      false,
    );
    expect(alice.proxySub).toBe("sub-old");
  });

  it("is a no-op when the account is already linked to the same subject", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-alice");
    expect(await linkProxyAccount(store, alice.id, { sub: "sub-alice", email: undefined })).toBe(
      false,
    );
    expect(alice.proxySub).toBe("sub-alice");
  });

  it("reports no link when the store's conditional write changes nothing", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example");
    const racingStore = { ...store, linkSubIfUnlinked: () => false };
    expect(await linkProxyAccount(racingStore, alice.id, { sub: "s", email: undefined })).toBe(
      false,
    );
  });
});

describe("unlinkProxyAccount", () => {
  it("removes a link so the identity no longer signs in", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-alice");
    expect(await unlinkProxyAccount(store, alice.id)).toBe(true);
    expect(alice.proxySub).toBeNull();
    expect(await findProxyAccount(store, { sub: "sub-alice", email: undefined })).toBeUndefined();
  });

  it("lets a password login link a new subject after a stale link is removed", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example", "sub-old");
    await unlinkProxyAccount(store, alice.id);
    expect(await linkProxyAccount(store, alice.id, { sub: "sub-new", email: undefined })).toBe(
      true,
    );
    expect(alice.proxySub).toBe("sub-new");
  });

  it("frees a deactivated account's subject for a new account", async () => {
    const { store, add } = createStore();
    const old = add("alice@old.example", "sub-alice", true);
    const current = add("alice@app.example");
    await unlinkProxyAccount(store, old.id);
    expect(await linkProxyAccount(store, current.id, { sub: "sub-alice", email: undefined })).toBe(
      true,
    );
  });

  it("returns false for an account with no link", async () => {
    const { store, add } = createStore();
    const alice = add("alice@app.example");
    expect(await unlinkProxyAccount(store, alice.id)).toBe(false);
  });
});

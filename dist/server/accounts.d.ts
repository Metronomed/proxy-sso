/**
 * @file Matching, linking, and unlinking proxy identities and app accounts
 */
import type { IProxyIdentity } from "./verify.js";
/** A value or a promise of it, so sync and async stores both fit. */
export type Awaitable<T> = T | Promise<T>;
/** The account fields the rules read. */
export interface IProxyAccount {
    /** Primary key. */
    id: number | string;
    /** Linked proxy subject, or null. */
    proxySub: string | null;
    /** Whether the account is deactivated. */
    isDeactivated: boolean;
}
/** Database access the app implements. Emails must be stored lowercased and unique. */
export interface IProxyAccountStore<TAccount extends IProxyAccount> {
    /** Finds the account linked to a subject, deactivated included. */
    findBySub: (sub: string) => Awaitable<TAccount | undefined>;
    /** Finds the account with this lowercased email, deactivated included. */
    findByEmail: (email: string) => Awaitable<TAccount | undefined>;
    /** Sets proxySub only while it is null; true when a row changed. */
    linkSubIfUnlinked: (accountId: TAccount["id"], sub: string) => Awaitable<boolean>;
    /** Sets proxySub to null; true when a row changed. */
    unlinkSub: (accountId: TAccount["id"]) => Awaitable<boolean>;
}
/**
 * Finds the active account an identity signs in as: by link, else by email if unlinked.
 * @param store - app database access
 * @param identity - verified proxy identity
 * @returns the matching active account, or undefined when none matches
 */
export declare function findProxyAccount<TAccount extends IProxyAccount>(store: IProxyAccountStore<TAccount>, identity: IProxyIdentity): Promise<TAccount | undefined>;
/**
 * Links an identity to an account after a password login, unless another account has it.
 * @param store - app database access
 * @param accountId - account that just proved its password
 * @param identity - verified proxy identity from the same request
 * @returns true when the link was written
 */
export declare function linkProxyAccount<TAccount extends IProxyAccount>(store: IProxyAccountStore<TAccount>, accountId: TAccount["id"], identity: IProxyIdentity): Promise<boolean>;
/**
 * Removes an account's link, e.g. on deactivation or to redo a wrong link.
 * @param store - app database access
 * @param accountId - account to unlink
 * @returns true when a link was removed
 */
export declare function unlinkProxyAccount<TAccount extends IProxyAccount>(store: IProxyAccountStore<TAccount>, accountId: TAccount["id"]): Promise<boolean>;
//# sourceMappingURL=accounts.d.ts.map
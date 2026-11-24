/**
 * @file Matching, linking, and unlinking proxy identities and app accounts
 */
/**
 * Finds the active account an identity signs in as: by link, else by email if unlinked.
 * @param store - app database access
 * @param identity - verified proxy identity
 * @returns the matching active account, or undefined when none matches
 */
export async function findProxyAccount(store, identity) {
    const account = await matchAccount(store, identity);
    if (!account) {
        console.warn("[proxy-sso] Verified proxy identity matches no active account - a password login links it");
    }
    return account;
}
/**
 * {@link findProxyAccount} without the warning.
 * @param store - app database access
 * @param identity - verified proxy identity
 * @returns the matching active account, or undefined when none matches
 */
async function matchAccount(store, identity) {
    const linked = await store.findBySub(identity.sub);
    if (linked)
        return linked.isDeactivated ? undefined : linked;
    if (!identity.email)
        return undefined;
    const byEmail = await store.findByEmail(identity.email);
    if (!byEmail || byEmail.isDeactivated || byEmail.proxySub)
        return undefined;
    return byEmail;
}
/**
 * Links an identity to an account after a password login, unless another account has it.
 * @param store - app database access
 * @param accountId - account that just proved its password
 * @param identity - verified proxy identity from the same request
 * @returns true when the link was written
 */
export async function linkProxyAccount(store, accountId, identity) {
    if (await store.findBySub(identity.sub))
        return false;
    if (identity.email) {
        const byEmail = await store.findByEmail(identity.email);
        if (byEmail && byEmail.id !== accountId)
            return false;
    }
    return store.linkSubIfUnlinked(accountId, identity.sub);
}
/**
 * Removes an account's link, e.g. on deactivation or to redo a wrong link.
 * @param store - app database access
 * @param accountId - account to unlink
 * @returns true when a link was removed
 */
export async function unlinkProxyAccount(store, accountId) {
    return store.unlinkSub(accountId);
}
//# sourceMappingURL=accounts.js.map
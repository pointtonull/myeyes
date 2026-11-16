export const REPO_URL = 'https://github.com/pointtonull/myeyes';

// MyEyes! has no site of its own: every user-facing link lands in the repository.
export const HOMEPAGE_URL = REPO_URL;
export const BLOG_URL = `${REPO_URL}/releases/`;
// Dormant: the inherited news feed is off by default (`fetchNews`) and has no UI toggle.
// It points at a file that does not exist, so it can never reach another site.
export const NEWS_URL = `${REPO_URL}/raw/main/docs/news.json`;
export const DEVTOOLS_DOCS_URL = `${REPO_URL}/blob/main/CONTRIBUTE.md`;
export const DONATE_URL = REPO_URL;
export const GITHUB_URL = REPO_URL;
export const MOBILE_URL = REPO_URL;
export const PRIVACY_URL = `${REPO_URL}/blob/main/PRIVACY.md`;
export const TWITTER_URL = REPO_URL;
export const UNINSTALL_URL = `${REPO_URL}/issues/`;
export const HELP_URL = `${REPO_URL}#readme`;

// Dark Reader's per-site fixes: the one deliberate dependency on upstream (see FORK.md).
export const CONFIG_URL_BASE = 'https://raw.githubusercontent.com/darkreader/darkreader/main/src/config';

export function getHelpURL(): string {
    return HELP_URL;
}

export function getBlogPostURL(postId: string): string {
    return `${BLOG_URL}${postId}/`;
}

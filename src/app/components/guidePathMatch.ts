export function matchesGuideTargetPath(currentPath: string, targetPath: string) {
  if (currentPath === targetPath) return true;

  const currentUrl = new URL(currentPath, "https://guide.local");
  const targetUrl = new URL(targetPath, "https://guide.local");

  if (currentUrl.pathname !== targetUrl.pathname) return false;

  for (const [key, value] of targetUrl.searchParams.entries()) {
    if (currentUrl.searchParams.get(key) !== value) {
      return false;
    }
  }

  return true;
}

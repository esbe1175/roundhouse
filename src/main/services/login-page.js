// Runs only in Kick's isolated login window. It opens the site's own dialog;
// credentials and submission remain entirely under the user's control.
export function openKickLogin() {
  if (location.origin !== "https://kick.com") return Promise.resolve(false);
  return new Promise((resolve) => {
    let attempts = 0;
    const visible = (element) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const timer = setInterval(() => {
      // Stop as soon as the dialog exists, including after client-side hydration.
      if ([...document.querySelectorAll('[data-testid="login-submit"], input[type="password"]')].some(visible)) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (++attempts > 30) {
        clearInterval(timer);
        resolve(false);
        return;
      }
      const button = [...document.querySelectorAll('button[data-testid="login"]')].find(
        (element) => visible(element) && !element.disabled && !element.closest('form, [role="dialog"]'),
      );
      // A server-rendered button can precede its click handler. Retry until the
      // actual form appears, but never click a submit button or fill any field.
      button?.click();
    }, 1000);
  });
}

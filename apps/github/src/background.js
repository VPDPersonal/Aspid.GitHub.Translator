// Network translation providers will send their requests from here: content scripts are bound
// by github.com's CORS rules. See @aspid-lingo/browser/providers.

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

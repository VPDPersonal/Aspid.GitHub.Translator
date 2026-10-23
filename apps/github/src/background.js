// Network translation providers will send their requests from here: content scripts are bound
// by github.com's CORS rules. See providers/index.js.

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

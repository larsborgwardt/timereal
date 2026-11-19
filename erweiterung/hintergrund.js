chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
});

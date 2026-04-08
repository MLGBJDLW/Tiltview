export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      browser.tabs.sendMessage(tabs[0].id, { type: 'command', command });
    }
  });
});

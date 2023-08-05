/** Potential Participant Tracker
 *            __..--''``---....___   _..._    __
 *        _.-'    .-/";  `        ``<._  ``.''_ `. 
 *    _.-' _..--.'_    \                    `( ) ) 
 *   (_..-'    (< _     ;_..__               ; `' 
 *              `-._,_)'      ``--...____..-' 
 * Created by Mike
 * Revised by Jason Liu on 2/21/2023
 * */

// On Open function to create custom menu
function onOpen() {
	createMenuWithSubMenu();
}

// Generate Custom Menu
function createMenuWithSubMenu() {
	SpreadsheetApp.getUi()
		.createMenu('🚀 Automation')
		.addItem('Process Emails 📧', 'processAllEmails')
		.addSeparator()
    .addItem('Process Forms 📝', 'processForm')
		.addSeparator()
    .addItem('Restore Version 😬', 'restoreVersion')
    .addSeparator()
		.addItem('Cleanup Labels 🧹', 'cleanupLabels')
		.addSeparator()
		.addItem('Cleanup Backups 🧹', 'cleanupBackups')
    .addSeparator()
		.addItem('Cleanup Logs 🧹', 'cleanupLogs')
    .addSeparator()
		.addItem('Reset Form Response Tracker 🖊️', 'resetLastResponseIndex')
		.addToUi();
}

// so that we can go through the entire form responses
function resetLastResponseIndex()
{
  if (!userAuthentication())
    return;
  PropertiesService.getScriptProperties().setProperty('lastResponseIndex', 0);
  SpreadsheetApp.getActive().toast(`Reset successful`, '🙂 Success!');
}

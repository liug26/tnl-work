/** RESTORE VERSION IMPLEMENTATION-------------------------------------------------------------------- */
function restoreVersion()
{
  try {
  if (!startUpCheck('RestoreVersion'))
    return;

  // get JobID from user
  log('Requesting restoring version\'s JobID from user');
  let ui = SpreadsheetApp.getUi();
  let result = ui.prompt('Restore Version',`Please enter the Job ID of the version you want to restore, or leave blank to restore the latest version`,ui.ButtonSet.OK_CANCEL);
	let button = result.getSelectedButton();
	let jobID = result.getResponseText();
  let sheetID;
	if (button == ui.Button.CANCEL)
  {
		log('User cancels action, exiting script');
    logScriptEnd();
    ui.alert('Not running script.');
    return;
	}
  else if (button == ui.Button.OK)
  {
    // the user wants to restore the latest version
		if (jobID == '')
    {
      log(`User enters [blank], restoring from the latest backup`);
      log(`Getting backup files from backup folder with ID: ${BACKUP_FOLDER_ID}`);
      let sortedFiles = getSortedFiles(BACKUP_FOLDER_ID, SHEET_MIMETYPE);
      if (sortedFiles.length == 0)
      {
        log('No backup files found in backup folder, exiting script');
        logScriptEnd();
        ui.alert('No backup files found in backup folder. \nNot running script.');
        return;
      }
      jobID = sortedFiles[0][0];
      sheetID = sortedFiles[0][1];
    }
    else if (isJobID(jobID))
    {
      log(`User enters ${jobID}, restoring from corresponding backup`);
      log(`Getting backup files from backup folder with ID: ${BACKUP_FOLDER_ID}`);
      sheetID = findFileIDByJobID(BACKUP_FOLDER_ID, jobID, SHEET_MIMETYPE);
      if (sheetID == null)
      {
        log(`No backup file found with Job ID: ${jobID}, exiting script`);
        logScriptEnd();
        ui.alert(`No backup file found with Job ID: ${jobID}. \nNot running script.`);
        return;
      }
    }
    else
    {
      log(`User enters ${jobID}, which is not a valid Job ID, exiting script`);
      logScriptEnd();
      ui.alert(`${jobID} is not a valid Job ID. \nNot running script.`);
      return;
    }
  }

  // before here no modifications were made
  // restore spreadsheet
  log(`Proceeds to restore spreadsheet with JobID: ${jobID} and ID: ${sheetID}`);
  restoreSpreadsheet(sheetID);

  // undo form actions
  let property = PropertiesService.getScriptProperties().getProperty(jobID);
  if (property == null)
  {
    log(`No script property with key: ${jobID} is found, lastResponseIndex unchanged: ${PropertiesService.getScriptProperties().getProperty('lastResponseIndex')}`);
  }
  else
  {
    log(`Found script property with key: ${jobID} and value: ${property}, resetting lastResponseIndex from ${PropertiesService.getScriptProperties().getProperty('lastResponseIndex')} to ${property}`);
    let numberedProperty = Number(property);
    PropertiesService.getScriptProperties().setProperty('lastResponseIndex', numberedProperty);
  }
  
  // undo all email actions
  let label = GmailApp.getUserLabelByName(jobID);
  if (label == null)
  {
    log(`No label named: ${jobID} with found, skipping`);
  }
  else
  {
    let threads = label.getThreads();
    let needsReviewLabel = GmailApp.getUserLabelByName('Needs Review');
    let processedLabel = GmailApp.getUserLabelByName('Processed');
	  for (let i = 0; i < threads.length; i++)
    {
      let currentThread = threads[i];
		  let message = threads[i].getMessages()[0];
		  let messageSubject = message.getSubject();
		  let messageSender = message.getFrom();
      log(`Resetting thread with index ${i + 1} out of ${threads.length}, subject: ${messageSubject}, and sender: ${messageSender}`);
      currentThread.moveToInbox();
	    currentThread.markUnread();
      currentThread.removeLabel(needsReviewLabel);
      currentThread.removeLabel(processedLabel)
	    const messageLength = currentThread.getMessageCount();
	    const messages = currentThread.getMessages();
	    if (messageLength > 0 && messages[messageLength - 1].isDraft() && DELETE_DRAFT_WHEN_RESTORE) {
        log('Moving last message of thread to trash');
		    messages[messageLength - 1].moveToTrash();
      }
	  }
    log(`Deleting label: ${jobID}`);
    GmailApp.deleteLabel(label);
  }

  SpreadsheetApp.getActive().toast(`Job ID ${jobID} was restored!`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

/** CLEANUP LABELS IMPLEMENTATION-------------------------------------------------------------------- */
function cleanupLabels()
{
  try {
  if (!startUpCheck('CleanUpLabels'))
    return;

  log('Prompting user to enter how many latest labels to keep');
  let ui = SpreadsheetApp.getUi();
  let result = ui.prompt('Cleanup Labels',`Please enter how many labels you want to keep, from newest to oldest.`,ui.ButtonSet.OK_CANCEL);
  let button = result.getSelectedButton();
	let response = result.getResponseText();
  let latestNum;
	if (button == ui.Button.CANCEL)
  {
		log('User cancels action, exiting script');
    logScriptEnd();
    ui.alert('Not running script.');
		return;
	}
  else if (button == ui.Button.OK)
  {
    if (isNaN(response))
    {
      log(`User enters ${response}, is not a number, exiting script`);
      logScriptEnd();
      ui.alert('You need to enter a number');
		  return;
    }
    else
    {
      log(`User enters ${response}, proceeding`);
      latestNum = Number(response);
    }
  }

  log('Fetching all backup files in backup folder');
  let allFiles = getSortedFiles(BACKUP_FOLDER_ID, SHEET_MIMETYPE);
  let allFilesLength = allFiles.length;

  // check time
  if (!inTime())
  {
    warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after sorting ${allFiles.length} backup files, exiting script`);
    logScriptEnd();
    ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds after sorting backup files. \nNo changes were made, and a Job ID wasn\'t generated. `);
    return;
  }

  // before this no modifications were made
  // deleting labels
  for (let i = latestNum; i < allFilesLength; i++)
  {
    log(`Deleting label indexed: ${i + 1} out of ${allFilesLength} with jobID: ${allFiles[i][0]}`);
    let label = GmailApp.getUserLabelByName(allFiles[i][0]);
    if (label == null)
    {
      log(`Didn\'t find label with name: ${allFiles[i][0]}, skipping`);
    }
    else
    {
      label.deleteLabel();
    }

    // check time
    if (!inTime())
    {
      warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after deleting labels with index ${i + 1}, exiting script`);
      logScriptEnd();
      ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while deleting labels. \n${i + 1} out of ${allFilesLength} labels were deleted. Re-run this function to finish up the rest of the labels. \nA Job ID wasn\'t generated.`);
      return;
    }
  }

  SpreadsheetApp.getActive().toast(`${allFilesLength - latestNum} out of ${allFilesLength} labels were moved to trash! No Job ID was generated.`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

/** CLEANUP BACKUPS IMPLEMENTATION-------------------------------------------------------------------- */
function cleanupBackups()
{
  try {
  if (!startUpCheck('CleanUpBackups'))
    return;

  log('Prompting user to enter how many latest backups to keep');
  let ui = SpreadsheetApp.getUi();
  let result = ui.prompt('Cleanup Backups',`Please enter how many backups you want to keep, from newest to oldest.`,ui.ButtonSet.OK_CANCEL);
  let button = result.getSelectedButton();
	let response = result.getResponseText();
  let latestNum;
	if (button == ui.Button.CANCEL)
  {
		log('User cancels action, exiting script');
    logScriptEnd();
    ui.alert('Not running script.');
		return;
	}
  else if (button == ui.Button.OK)
  {
    if (isNaN(response))
    {
      log(`User enters ${response}, is not a number, exiting script`);
      logScriptEnd();
      ui.alert('You need to enter a number');
		  return;
    }
    else
    {
      log(`User enters ${response}, proceeding`);
      latestNum = Number(response);
    }
  }

  log('Fetching all backup files in backup folder');
  let allFiles = getSortedFiles(BACKUP_FOLDER_ID, SHEET_MIMETYPE);
  let allFilesLength = allFiles.length;

  log('Fetching all script properties');
  let keys = PropertiesService.getScriptProperties().getKeys();

  // check time
  if (!inTime())
  {
    warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after sorting ${allFiles.length} backup files, exiting script`);
    logScriptEnd();
    ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds after sorting backup files. \nNo changes were made, and a Job ID wasn\'t generated. `);
    return;
  }

  // before this no modifications were made
  // deleting labels
  for (let i = latestNum; i < allFilesLength; i++)
  {
    let jobID = allFiles[i][0];
    log(`Deleting backup indexed: ${i + 1} out of ${allFilesLength} with jobID: ${jobID}`);
    log(`Trashing backup file with ID: ${allFiles[i][1]}`);
    let file = DriveApp.getFileById(allFiles[i][1]);
    file.setTrashed(true);

    log(`Trashing script property with key: ${jobID}`);
    if (keys.includes(jobID))
    {
      PropertiesService.getScriptProperties().deleteProperty(jobID);
    }
    else
    {
      log(`Didn\'t find script property with key: ${jobID}, skipping`);
    }

    log(`Trashing label named: ${jobID}`);
    let label = GmailApp.getUserLabelByName(jobID);
    if (label == null)
    {
      log(`Didn\'t find label with name: ${jobID}, skipping`);
    }
    else
    {
      label.deleteLabel();
    }

    // check time
    if (!inTime())
    {
      warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after deleting backups with index ${i + 1}, exiting script`);
      logScriptEnd();
      ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while deleting backups. \n${i + 1} out of ${allFilesLength} backups were deleted. Re-run this function to finish up the rest of the labels. \nA Job ID wasn\'t generated.`);
      return;
    }
  }

  SpreadsheetApp.getActive().toast(`${allFilesLength - latestNum} out of ${allFilesLength} backups were moved to trash! No Job ID was generated.`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

// Backup spreadsheet before doing anything
function backupSpreadsheet(jobID)
{
	const fileName = `${getDate()}-(${jobID})`;
	const DEST_FOLDER = DriveApp.getFolderById(BACKUP_FOLDER_ID);
	const spreadSheetID = SpreadsheetApp.getActiveSpreadsheet().getId();
	DriveApp.getFileById(spreadSheetID).makeCopy(fileName, DEST_FOLDER);
}

// delete all sheets in active spreadsheet, and copy all sheets from backup spreadsheet to active spreadsheet
function restoreSpreadsheet(backupSheetID)
{
  log('Opening current and backup spreadsheet');
  let currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const backupSpreadsheet = SpreadsheetApp.openById(backupSheetID);
  let currentSheets = currentSpreadsheet.getSheets();
  const backupSheets = backupSpreadsheet.getSheets();
  log('Creating a temporary sheet in current spreadsheet');
  if (currentSpreadsheet.getSheetByName('temp') == null)
    currentSpreadsheet.insertSheet('temp');
  log('Deleting all original sheets in current spreadsheet');
  for (let i = 0; i < currentSheets.length; i++)
  {
    log(`Deleting sheet: ${currentSheets[i].getName()} in current spreadsheet`);
    currentSpreadsheet.deleteSheet(currentSheets[i]);
  }
  log('Copying all backup sheets to current spreadsheet');
  for (let i = 0; i < backupSheets.length; i++)
  {
    log(`Copying sheet: ${backupSheets[i].getName()} to current spreadsheet`);
    let newSheet = backupSheets[i].copyTo(currentSpreadsheet);
    newSheet.setName(newSheet.getName().replace('Copy of ', ''));
  }
  log('Deleting temporary sheet in current spreadsheet');
  currentSpreadsheet.deleteSheet(currentSpreadsheet.getSheetByName('temp'));
}

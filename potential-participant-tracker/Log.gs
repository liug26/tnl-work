// a list of strings that will be written to a Google Doc upon ending of script
let logs = [];

// stands for record (in logs) and print (in Logger)
function rnp(msg)
{
  Logger.log(msg);
  logs.push(msg);
}

// rnp the start time of script, call at the beginning of execution
function logScriptStart()
{
  rnp(`Script execution starts at ${getTime()}`);
}

// rnp the message and when it is emitted
function log(str)
{
  rnp(`[${getTime()}]${str}`);
}

// rnp the end and execution time of script, call at the end of execution
function logScriptEnd()
{
  rnp(`Script execution ends, execution time: ${passedTime()}`);
  saveLog(false);
}

// log but with a warning sign
function warning(str)
{
  rnp(`Warning: [${getTime()}]${str}`)
}

// record an error and crashes (this part we rely on other functions to immediately end the program, because Google Apps Script does not have an exit program function)
// logStr will be recorded in log, msg will be alerted to the user as a popup
function error(logStr, msg)
{
  rnp(`ERROR: [${getTime()}]${logStr}`)
  rnp(`Script execution ends, execution time: ${passedTime()}`);
  saveLog(true);
  SpreadsheetApp.getUi().alert(msg);
}

// catches an unknown error
function unkError(err)
{
  rnp(`ERROR: [${getTime()}]Unknown error occurs`)
  rnp(err);
  rnp(`Script execution ends, execution time: ${passedTime()}`);
  saveLog(true);
  SpreadsheetApp.getUi().alert(`Unknown error occurs. \nPlease check log for details`);
}

// call at the end of program
// saves the strings in log into a Google Doc in the log folder
function saveLog(crashed)
{
  if (logs.length == 0)
    return;
  let fileName = `${getDate()}`;
  if (crashed)
    fileName = '(CRASH) ' + fileName;
  let doc = DocumentApp.create(fileName);
  DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(LOG_FOLDER_ID));
  doc.setText(logs[0]);
  for (let i = 1; i < logs.length; i++)
    doc.appendParagraph(logs[i]);
}

/** CLEAN UP LOGS IMPLEMENTATION-------------------------------------------------------------------- */
function cleanupLogs()
{
  try {
  if (!startUpCheck('CleanUpLogs'))
    return;

  log('Prompting user to enter how many latest logs to keep');
  let ui = SpreadsheetApp.getUi();
  let result = ui.prompt('Cleanup Logs',`Please enter how many logs you want to keep, from newest to oldest.`,ui.ButtonSet.OK_CANCEL);
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

  // find and sort old logs in log folder, works like getSortedFiles()
  log('Fetching all logs in log folder');
  let logFolder = DriveApp.getFolderById(LOG_FOLDER_ID);
  let logs = logFolder.getFiles();
  let allLogs = [];
  while (logs.hasNext())
  {
    let log = logs.next();
    if (log.getMimeType() != DOC_MIMETYPE)
    {
      warning(`Invalid file type name detected in log folder with name: ${log.getName()} and ID: ${log.getId()}`);
      continue;
    }
    allLogs.push([log.getName(), log.getId()]);
  }
  log('Sorting all logs in log folder');
  allLogs.sort(sortLogsByDate);
  log('Sorting results:');
  for (let i = 0; i < allLogs.length; i++)
    log(`Index: ${i + 1}, name: ${allLogs[i][0]}, ID: ${allLogs[i][1]}`);
  
  // check time
  if (!inTime())
  {
    warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after sorting ${allLogs.length} logs, exiting script`);
    logScriptEnd();
    ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while sorting logs. \nNo changes were made, and a Job ID wasn\'t generated. `);
    return;
  }
  
  // before here no modifications were made
  log('Deletion starts');
  // delete everything but the first latestNum files
  let allLogsLength = allLogs.length;
  for (let i = latestNum; i < allLogsLength; i++)
  {
    log(`Deleting index: ${i + 1} out of ${allLogsLength} with log name: ${allLogs[i][0]} and ID: ${allLogs[i][1]}`);
    SpreadsheetApp.getActive().toast(`Deleting log ${i + 1} out of ${allLogsLength}`);
    DriveApp.getFileById(allLogs[i][1]).setTrashed(true);

    // check time
    if (!inTime())
    {
      warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after deleting log with index ${i + 1}, exiting script`);
      logScriptEnd();
      ui.alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while deleting logs. \n${i + 1} out of ${allLogsLength} logs were deleted. Re-run this function to finish up the rest of the logs. \nA Job ID wasn\'t generated.`);
      return;
    }
  }

  SpreadsheetApp.getActive().toast(`${allLogsLength - latestNum} out of ${allLogsLength} logs were moved to trash! No Job ID was generated.`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

// similiar to sortFilesByDate, but date string is the entire name (1st element of a & b) instead
function sortLogsByDate(a, b)
{
  let aTime = new Date(a[0]).getTime();
  let bTime = new Date(b[0]).getTime();
  if (aTime === bTime)
    return 0;
  else
    return (aTime > bTime) ? -1 : 1;
}

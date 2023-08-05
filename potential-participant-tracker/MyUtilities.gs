/** GLOBAL VARIABLES -------------------------------------------------------------------- */
// change these to correct file IDs before adapting to actual use
const BACKUP_FOLDER_ID = '1j7AEamTmraI7RMusLABMyWyc18bSaubS';
const LOG_FOLDER_ID = '1O0muUxb2g-2H9L86PrJKc9X_nlEGd2m7';
const FORM_ID = '1EOuvqsXzRQcR4h0LuSiAqXlB4ehm6s5tNX9vyJ9oj58';

const DOC_MIMETYPE = 'application/vnd.google-apps.document';
const SHEET_MIMETYPE = 'application/vnd.google-apps.spreadsheet';
const FORM_MIMETYPE = 'application/vnd.google-apps.form';

// There seems a weird bug (on Google's side, not mine), when a draft (of type GmailMessage) gets trashed, Gmail still displays that the draft exists (with that red 'Draft' sign). This sign can't seem to be gotten rid of, and always occupies a space in the draft inbox. 
const DELETE_DRAFT_WHEN_RESTORE = false;

const PASSWORD_HASH = '7215ee9c7d9dc229d2921a40e899ec5f';  // 6d9b298d80f6a2dab59d4879c2e1a8a9

const MAX_RUNTIME = 5.5 * 60;  // 5.5 minutes
let startTimestamp = new Date().getTime();

// can be initialized by loadSpreadsheet()
let masterList, initialOutreach;
let masterLength, dqLength;
let masterEmails, dqEmails, masterPhones, dqPhones;

/** SCRIPT PRE-CHECKS -------------------------------------------------------------------- */
// call upon start of script to check authentication, labels, and files
function startUpCheck(funcName)
{
  logScriptStart();
  log(`${funcName} triggered by user, authenticating user...`);

	// authenticate user and confirm before running script
  if (!userAuthentication())
  {
    logScriptEnd();
    return false;
  }
  log('User authentication passed')

  // check if required folders and form exist
  if (DriveApp.getFolderById(BACKUP_FOLDER_ID) == null)
  {
    error(`Backup folder with ID: ${BACKUP_FOLDER_ID} not found`, `Backup folder with ID: ${BACKUP_FOLDER_ID} not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (DriveApp.getFolderById(LOG_FOLDER_ID) == null)
  {
    error(`Log folder with ID: ${LOG_FOLDER_ID} not found`, `Log folder with ID: ${LOG_FOLDER_ID} not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (DriveApp.getFolderById(FORM_ID) == null)
  {
    error(`Google Form with ID: ${FORM_ID} not found`, `Google Form with ID: ${FORM_ID} not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }

  // check if active spreadsheet has sheets named 'Master List', 'Initial Outreach', and 'DQ'd'
  let spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
	if (spreadSheet == null)
  {
    error('SpreadsheetApp.getActiveSpreadsheet() returns null', `Active spreadsheet not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (spreadSheet.getSheetByName('Master List') == null)
  {
    error(`Master List not found in active spreadsheet`, `Sheet named \'Master List\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (spreadSheet.getSheetByName('Initial Outreach') == null)
  {
    error(`Initial Outreach not found in active spreadsheet`, `Sheet named \'Initial Outreach\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`)
    return false;
  }
  if (spreadSheet.getSheetByName('DQ\'d') == null)
  {
    error(`DQ\'d list not found in active spreadsheet`, `Sheet named \'DQ\'d\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }

  // check if Gmail labels exist
  if (GmailApp.getUserLabelByName('Automated Processing') == null)
  {
    error(`Automated Processing Label not found`, `Gmail label named \'Automated Processing\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (GmailApp.getUserLabelByName('Processed') == null)
  {
    error(`Processed Label not found`, `Gmail label named \'Processed\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }
  if (GmailApp.getUserLabelByName('Needs Review') == null)
  {
    error(`Needs Review Label not found`, `Gmail label named \'Needs Review\' was not found. \nNo changes were made, and a Job ID wasn\'t generated`);
    return false;
  }

  return true;
}

/* Creates an MD5 hash from an input string.
 * ------------------------------------------
 *   MD5 function for GAS(GoogleAppsScript)
 *
 * You can get a MD5 hash value and even a 4digit short Hash value of a string.
 * ------------------------------------------------------------------------------
 * @param {(string|Bytes[])} input The value to hash.
 * @param {boolean} isShortMode Set true for 4 digit shortend hash, else returns usual MD5 hash.
 * @return {string} The hashed input
 * @customfunction
 */
function MD5(input, isShortMode)
{
	var isShortMode = !!isShortMode; // Be sure to be bool
	var txtHash = '';
	var rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input);

	if (!isShortMode) {
		for (i = 0; i < rawHash.length; i++) {
			var hashVal = rawHash[i];
			if (hashVal < 0) {
				hashVal += 256;
			}
			if (hashVal.toString(16).length == 1) {
				txtHash += '0';
			}
			txtHash += hashVal.toString(16);
		}
	} else {
		for (j = 0; j < 16; j += 8) {
			hashVal =
				(rawHash[j] + rawHash[j + 1] + rawHash[j + 2] + rawHash[j + 3]) ^
				(rawHash[j + 4] + rawHash[j + 5] + rawHash[j + 6] + rawHash[j + 7]);

			if (hashVal < 0) {
				hashVal += 1024;
			}
			if (hashVal.toString(36).length == 1) {
				txtHash += '0';
			}
			txtHash += hashVal.toString(36);
		}
	}
	// change below to "txtHash.toUpperCase()" if needed
	return txtHash;
}

// User password authentication on button click
function userAuthentication()
{
	let ui = SpreadsheetApp.getUi();
	let result = ui.prompt(
		'Are you sure you want to continue?',
		'Please enter the password:',
		ui.ButtonSet.OK_CANCEL
	);
	let button = result.getSelectedButton();
	let passwordResponse = MD5(result.getResponseText());
	// User clicks cancel
	if (button == ui.Button.CANCEL) {
    log('User canceled execution');
		ui.alert('Not running script.');
		return false;
		// Incorrect password
	} else if (passwordResponse !== PASSWORD_HASH) {
    warning(`User authentication failed! Incorrect password: ${passwordResponse}`);
		ui.alert('Incorrect password.\nNot running script.');
		return false;
		// Correct password. Run script
	} else if (button == ui.Button.OK && passwordResponse == PASSWORD_HASH) {
		return true;
		// Edge case catcher
	} else {
		warning('Uncaught edge case in userAuthentication()');
		return false;
	}
}

// load uninitialized data from spreadsheet
function loadSpreadsheet()
{
  let spreadSheet = SpreadsheetApp.getActiveSpreadsheet();
  masterList = spreadSheet.getSheetByName('Master List');
  initialOutreach = spreadSheet.getSheetByName('Initial Outreach');
  let dqList = spreadSheet.getSheetByName("DQ'd");
  masterEmails = masterList.getRange('C2:C').getValues();
  dqEmails = dqList.getRange('C2:C').getValues();
  masterPhones = masterList.getRange('B2:B').getValues();
  dqPhones = dqList.getRange('B2:B').getValues();
  for (masterLength = masterEmails.length - 1; masterLength >= 0 && masterEmails[masterLength][0] == '';  masterLength--);
  masterLength++;
  for (dqLength = dqEmails.length - 1; dqLength >= 0 && dqEmails[dqLength][0] == ''; dqLength--);
  dqLength++;
  for (let i = 0; i < masterLength; i++)
    masterPhones[i][0] = String(masterPhones[i][0]).replace(/\D/g, '');
  for (let i = 0; i < dqLength; i++)
    dqPhones[i][0] = String(dqPhones[i][0]).replace(/\D/g, '');
}

// returns true if emailAddress is in Master List
function isInMasterEmail(emailAddress)
{
  for (let i = 0; i < masterLength; i++)
    if (emailAddress == masterEmails[i])
      return true;
  return false;
}

// returns true if emailAddress is in DQ
function isInDQEmail(emailAddress)
{
  for (let i = 0; i < dqLength; i++)
    if (emailAddress == dqEmails[i])
      return true;
  return false;
}

// returns true if phone number is in Master List
function isInMasterPhone(phone)
{
  phone = phone.replace(/\D/g, '');
  if (phone == '')
    return false;
  for (let i = 0; i < masterLength; i++)
    if (phone == masterPhones[i])
      return true;
  return false;
}

// returns true if phone number is in DQ
function isInDQPhone(phone)
{
  phone = phone.replace(/\D/g, '');
  if (phone == '')
    return false;
  for (let i = 0; i < masterLength; i++)
    if (phone == dqPhones[i])
      return true;
  return false;
}

// call when appending to spreadsheet's Master List
// dynamically adds to temporarily stored Master List newly added emailAddress and phoneNumber
function addToMaster(emailAddress, phoneNumber)
{
  masterEmails[masterLength++] = emailAddress;
  masterPhones[masterLength] = phoneNumber.replace(/\D/g, '');
}

/** JOB ID -------------------------------------------------------------------- */
// Generarte a uuid for the job
function generateJobID() {
	return 'xxxx-xxxx'.replace(/[xy]/g, function (c) {
		var r = (Math.random() * 16) | 0,
			v = c == 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
	});
}

// Check if string is in the format of xxxx-xxxx
function isJobID(jobID) {
	const regex = /[0-9a-fA-F]+-[0-9a-fA-F]+/g;
	const match = regex.exec(jobID);
	return match;
}

// call after verifying with isValidBackUpName() that there is a jobID in name
// returns the JobID if name is in format [date]-([jobID])
function getJobIDFromName(name)
{
  if (name.length < 12)
    return '';
  return name.substring(name.length - 10, name.length - 1);
}

// returns true if name is in format [date]-([jobID])
function isValidBackupName(name)
{
  if (name.length < 12 || name[name.length - 12] != '-')
    return false;
  let jobID = name.substring(name.length - 10, name.length - 1);
  if (!isJobID(jobID))
    return false;
  if (isNaN(new Date(name.substring(0, name.length - 12)).getTime()))
    return false;
  return true;
}

/** DATE & TIME -------------------------------------------------------------------- */
// Get current date, in format month/day/year-hour:minute
function getDate() {
	let date = new Date();
	let month = date.getMonth() + 1;
	let day = date.getDate();
	let year = date.getFullYear();
	let hour = date
		.getHours()
		.toLocaleString('en-US', { minimumIntegerDigits: 2 });
	let minute = date
		.getMinutes()
		.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
	let fullDate = `${month}/${day}/${year}-${hour}:${minute}`;
	return fullDate;
}

// Get current time, in format month/day/year-hour:minute:second
function getTime() {
  let date = new Date();
	let month = date.getMonth() + 1;
	let day = date.getDate();
	let year = date.getFullYear();
	let hour = date
		.getHours()
		.toLocaleString('en-US', { minimumIntegerDigits: 2 });
	let minute = date
		.getMinutes()
		.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
  let second = date
		.getSeconds()
		.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
	return `${month}/${day}/${year}-${hour}:${minute}:${second}`;
}

// returns true if program has been running for less time than MAX_RUNTIME
function inTime()
{
  return new Date().getTime() - startTimestamp < MAX_RUNTIME * 1000;
}

// returns in seconds the execution time of the program
function passedTime()
{
  return (new Date().getTime() - startTimestamp) / 1000;
}

/** FILES -------------------------------------------------------------------- */
// get files from folder with ID folderID and of MimeType mimeType that has a valid backup name (a date string and a jobID)
// then sort the files by the date string, from earliest to oldest
// returns a 2D array of size numFiles with each element being [jobID seen in file's name, file's ID]
function getSortedFiles(folderID, mimeType)
{
  let folder = DriveApp.getFolderById(folderID);
  let files = folder.getFiles();
  let allFiles = [];
  while (files.hasNext())
  {
    file = files.next();
    if (!isValidBackupName(file.getName()))
    {
      warning(`Invalid backup file name detected in backup folder with name: ${file.getName()} and ID: ${file.getId()}`);
      continue;
    }
    if (file.getMimeType() != mimeType)
    {
      warning(`Invalid backup file type detected in backup folder with name: ${file.getName()} and ID: ${file.getId()}`);
      continue;
    }
    allFiles.push([file.getName(), file.getId()]);
  }

  allFiles.sort(sortFilesByDate);
  log('Sorting results: ');
  for (let i = 0; i < allFiles.length; i++)
  {
    let jobID = getJobIDFromName(allFiles[i][0]);
    log(`Index: ${i + 1}, name: ${allFiles[i][0]}, jobID: ${jobID}, ID: ${allFiles[i][1]}`);
    allFiles[i][0] = jobID;
  }
  return allFiles;
}

// compare a and b's date string located in the first element of a and b
// returns 0 if a & b's date strings are at the same time, -1 if a's date string is earlier, 1 is b's date string is earlier
function sortFilesByDate(a, b)
{
  let aTime = new Date(a[0].substring(0, a[0].length - 12)).getTime();
  let bTime = new Date(b[0].substring(0, b[0].length - 12)).getTime();
  if (aTime === bTime)
    return 0;
  else
    return (aTime > bTime) ? -1 : 1;
}

// given a jobID and the file's mimeType, search in the folder with folderID if there is a corresponding file
// returns the file's ID is found, null otherwise
function findFileIDByJobID(folderID, jobID, mimeType)
{
  let folder = DriveApp.getFolderById(folderID);
  let files = folder.getFiles();
  while (files.hasNext())
  {
    file = files.next();
    if (getJobIDFromName(file.getName()) === jobID)
    {
      if (file.getMimeType() == mimeType)
      {
        return file.getId();
      }
    }
  }
  return null;
}

/** MISC -------------------------------------------------------------------- */
// Regex phone number search function
function findPhoneNumber(messageBody) {
	const REGEX = /\(?\d{3}\)?-?.? *\d{3}-?.? *-?\d{4}/g;
	const match = REGEX.exec(messageBody);
	if (match) {
		const phoneNumber = match[0];
		return phoneNumber;
	} else {
		return null;
	}
}

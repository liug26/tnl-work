/** PROCESS EMAILS IMPLEMENTATION-------------------------------------------------------------------- */
function processAllEmails()
{
  try{
  if (!startUpCheck('ProcessEmails'))
    return;
  
  log('Fetching spreadsheet data: Master List, Initial Outreach, DQ\'d');
  loadSpreadsheet();
  
  log('Fetching emails labeled \'Automated Processing\'')
  let allEmails = gatherEmails();
  if (allEmails.length == 0)
  {
    log('No emails labeled \'Automated Processing\' were found, exiting script');
    logScriptEnd();
    SpreadsheetApp.getActive().toast('No emails labeled \'Automated Processing\' were found. No changes were made, and a Job ID wasn\'t generated', '😮 Info');
    return;
  }

  // before here no modifcations were made
  let jobID = generateJobID();
  log(`Created a Job ID: ${jobID}, creating corresponding Gmail label`)
  GmailApp.createLabel(`${jobID}`);

  // backup old spreadsheet
  log('Backing up unmodified spreadsheet')
  backupSpreadsheet(jobID);

  // check time in case backup takes a long time
  if (!inTime())
  {
    warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after backing up spreadsheet, no emails were processed, exiting script`);
    logScriptEnd();
    SpreadsheetApp.getUi().alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds after backing up spreadsheet and before any emails were processed. Re-run this function to finish up the rest of the emails. \nJob ID was ${jobID}`);
    return;
  }

  // process emails
  let allEmailsLength = allEmails.length;
  for (let i = 0; i < allEmailsLength; i++)
  {
    log(`Processing email ${i + 1} out of ${allEmailsLength}`)
    SpreadsheetApp.getActive().toast(`Processing email ${i + 1} out of ${allEmailsLength}`);
    processEmail(allEmails[i], jobID);

    // if time is up
    if (!inTime())
    {
      warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after processing email ${i + 1} out of ${allEmailsLength}, exiting script`);
      logScriptEnd();
      SpreadsheetApp.getUi().alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while processing emails. \n${i + 1} out of ${allEmailsLength} emails were processed. Re-run this function to finish up the rest of the emails. \nJob ID was ${jobID}`);
      return;
    }
  }

  let currentLastResponseIndex = PropertiesService.getScriptProperties().getProperty('lastResponseIndex');
  log(`Creating script property with key: ${jobID} and value: ${currentLastResponseIndex} (also the current unchanged lastResponseIndex)`);
  PropertiesService.getScriptProperties().setProperty(jobID, currentLastResponseIndex);

	SpreadsheetApp.getActive().toast(`All ${allEmailsLength} emails were processed! Job ID was ${jobID}`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

// Create a multidimensional array of messages that need processing. Subarray items include Full Transcript at index 0, Message Subject at index 1, and Message Sender at index 2.
function gatherEmails()
{
	let label = GmailApp.getUserLabelByName('Automated Processing');
  if (label == null)
    return [];  // this case should be prevented by running startUpCheck()
	let threads = label.getThreads();
	let emails = [];
	for (let i = 0; i < threads.length; i++)
  {
		let message = threads[i].getMessages()[0];
		let messageBody = message.getPlainBody();
		let messageSubject = message.getSubject();
		let messageSender = message.getFrom();
		emails[i] = [messageBody, messageSubject, messageSender];
	}
	return emails;
}

// Process each message and add to Master List spreadsheet.
function processEmail(email, jobID)
{
  let body = email[0];
	let sender = email[2];
	let emailAddress = sender.substring(sender.indexOf('<') + 1, sender.indexOf('>'));
	
  // Check for duplicate email address on Master List
  let inMaster = isInMasterEmail(emailAddress);
  let inDQ = isInDQEmail(emailAddress)
  let emailThread = GmailApp.search(`label: automated - processing from: (${emailAddress})`)[0];
  if (inMaster || inDQ)
  {
    if (inMaster)
    {
      log(`${emailAddress} is already on the Master List, labeled \'Needs Review\'`);
    } else {
      log(`${emailAddress} is already on the DQ'd List, labeled \'Needs Review\'`);
    }
    emailThread.removeLabel(
			GmailApp.getUserLabelByName('Automated Processing')
		);
		emailThread.addLabel(GmailApp.getUserLabelByName('Needs Review'));
		emailThread.addLabel(GmailApp.getUserLabelByName(`${jobID}`));
  }
  else
  {
    log(`${emailAddress} is not on the Master List or DQ'd list, adding to Master List and Initial Outreach`);
    // Search for phone number with regex
		let possiblePhoneNumber = findPhoneNumber(body);
		let phoneNumber;
		if (possiblePhoneNumber == null) {
			phoneNumber = 'Not Found';
		} else {
			phoneNumber = possiblePhoneNumber;
		}
		let name;
		let messageName = sender.substring(0, sender.indexOf('<') - 1);
		if (messageName.includes('.com') || messageName === '' || messageName === null || messageName === 'null') {
			name = 'Not Found';
		} else {
			name = messageName;
		}
    log(`Making changes to Master List, Initial Outreach, and Gmail labels`)
		masterList.appendRow([`${name}`, `${phoneNumber}`, `${emailAddress}`]);
		initialOutreach.appendRow([`${name}`, `${phoneNumber}`, `${emailAddress}`, `${getDate()} (Computer)`]);
		emailThread.removeLabel(GmailApp.getUserLabelByName('Automated Processing'));
		emailThread.addLabel(GmailApp.getUserLabelByName('Processed'));
		emailThread.addLabel(GmailApp.getUserLabelByName(`${jobID}`));
    addToMaster(emailAddress, phoneNumber);
    log('Creating draft reply');
		replyMessage = emailThread.createDraftReply('', {
			htmlBody:
				"<p>Hello,</p><p>Thank you for contacting the Translational Neuroimaging Lab at UCLA. In order to find out if you're eligible for the research study, we will need to set up a time to speak on the phone. When we talk, I can tell you more about the study. If you decide you're interested in participating, I'll ask you questions to determine your eligibility. We will need about 10-15 minutes, and it would be good for you to be in a private location where you can speak freely.</p><p>Please reply to this message with your phone number and a few dates and times that you can speak freely on the phone for <strong>10-15 minutes</strong>. We have the most availability during business hours <strong>(9am-5pm Monday through Friday)</strong>.</p><p>Sincerely,<br>Translational Neuroimaging Research Team</p><p style='font-size: .75rem; color: grey;'>--</p><p style='font-size: .75rem; color: grey;'>Translational Neuroimaging Lab</p><p style='font-size: .75rem; color: grey;'>Department of Psychiatry & Biobehavioral Sciences</p><p style='font-size: .75rem; color: grey;'>University of California, Los Angeles</p><p><a href='https://www.translational-neuroimaging.com/' style='font-size: .75rem;'>https://www.translational-neuroimaging.com/</a></p><p><a href='tel:4245323802' style='font-size: .75rem;'>424-532-3802</a></p>",
		});
  }
}

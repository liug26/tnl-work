/** PROCESS FORM IMPLEMENTATION-------------------------------------------------------------------- */
function processForm()
{
  try {
  if (!startUpCheck('ProcessForm'))
    return;

  log('Fetching spreadsheet data: Master List, Initial Outreach, DQ\'d')
  loadSpreadsheet();
  
  log(`Fetching responses from form with ID: ${FORM_ID}`);
  const form = FormApp.openById(FORM_ID);  // form shouldn't be null due to startUpCheck()
  const allResponses = form.getResponses();
  let allResponsesLength = allResponses.length;
  if (allResponsesLength == 0)
  {
    log('No form responses were found, exiting script');
    logScriptEnd();
    SpreadsheetApp.getUi().alert('No form responses were found. \nNo changes were made, and a Job ID wasn\'t generated');
    return;
  }

  log('Fetching lastResponseIndex from Script Properties');
  let lastResponseIndex = PropertiesService.getScriptProperties().getProperty('lastResponseIndex');
  if (isNaN(lastResponseIndex))
  {
    error(`lastResponseIndex is not a number: ${lastResponseIndex}, exiting script `, `Property lastResponseIndex: ${lastResponseIndex} is not a number! \nNo changes were made, and a Job ID wasn\'t generated`);
    return;
  }
  else
    lastResponseIndex = Number(lastResponseIndex);
  if (lastResponseIndex > allResponsesLength || lastResponseIndex < 0)
  {
    error(`lastResponseIndex is an invalid number: ${lastResponseIndex} (lastResponseIndex < 0 or > ${allResponsesLength}), exiting script `, `Property lastResponseIndex: ${lastResponseIndex} is an invalid number! \nNo changes were made, and a Job ID wasn\'t generated`);
    return;
  }
  if (allResponsesLength - lastResponseIndex == 0)
  {
    log(`There are no new form responses. allResponsesLength: ${allResponsesLength}, lastResponseIndex: ${lastResponseIndex}`);
    logScriptEnd();
    SpreadsheetApp.getUi().alert('There are no new form responses. \nNo changes were made, and a Job ID wasn\'t generated');
    return;
  }
  log(`Starting response processing at index: ${lastResponseIndex}`);

  // before here no modifcations were made
  let jobID = generateJobID();
  log(`Created a Job ID: ${jobID}`);
  GmailApp.createLabel(`${jobID}`);

  // backup old spreadsheet
  log('Backing up unmodified spreadsheet');
  backupSpreadsheet(jobID);

  // check time in case backup takes a long time
  if (!inTime())
  {
    warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after backing up spreadsheet, no form responses were processed, exiting script`);
    logScriptEnd();
    SpreadsheetApp.getUi().alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds after backing up spreadsheet and before any form responses were processed. Re-run this function to finish up the rest of the form responses. \nJob ID was ${jobID}`);
    return;
  }

  // process form
  log(`Adding new script property with key: ${jobID} and value: ${lastResponseIndex}`);
  PropertiesService.getScriptProperties().setProperty(jobID, lastResponseIndex);
  for (let i = lastResponseIndex; i < allResponsesLength; i++)
  {
    log(`Processing form response ${i + 1} out of ${allResponsesLength}`)
    SpreadsheetApp.getActive().toast(`Processing form response ${i + 1} out of ${allResponsesLength - lastResponseIndex}`);
    processFormResponse(allResponses[i], jobID);
    log(`Setting lastResponseIndex property to ${i + 1}`);
    PropertiesService.getScriptProperties().setProperty('lastResponseIndex', i + 1);

    // if time is up
    if (!inTime())
    {
      log(`Adding new script property with key: ${jobID} and value: ${i + 1}`);
      PropertiesService.getScriptProperties().setProperty(jobID, i + 1);
      warning(`Max runtime limit: ${MAX_RUNTIME}s exceeds after processing form response ${i + 1} out of ${allResponsesLength}, exiting script`);
      logScriptEnd();
      SpreadsheetApp.getUi().alert(`Max runtime limit: ${MAX_RUNTIME}s exceeds while processing form responses. \n${i + 1} out of ${allResponsesLength - lastResponseIndex} form responses were processed. Re-run this function to finish up the rest of the form responses. \nJob ID was ${jobID}`);
      return;
    }
  }

  SpreadsheetApp.getActive().toast(`All ${allResponsesLength - lastResponseIndex} form responses were processed! Job ID was ${jobID}`, '🙂 Success!');
  logScriptEnd();
  } catch (e) { unkError(e); }
}

// process each form response
function processFormResponse(response, jobID)
{
  const name = response.getItemResponses()[0].getResponse();
	const phone = response.getItemResponses()[1].getResponse();
	const email = response.getItemResponses()[2].getResponse();
  if (isInMasterEmail(email))
  {
    log(`Response with email: ${email} is already on the Master List, skipping`);
    return;
  }
  if (isInMasterPhone(phone))
  {
    log(`Response with phone number: ${phone} is already on the Master List, skipping`);
    return;
  }
  if (isInDQEmail(email))
  {
    log(`Response with email: ${email} is already on the DQ List, skipping`);
    return;
  }
  if (isInDQPhone(phone))
  {
    log(`Response with phone number: ${phone} is already on the DQ List, skipping`);
    return;
  }

  // Add participant to Master List and Initial Outreach tabs
  log(`Response with email: ${email} and phone number: ${phone} is new, adding to Master List and Initial Outreach`);
	masterList.appendRow([`${name}`, `${phone}`, `${email}`]);
	initialOutreach.appendRow([`${name}`, `${phone}`, `${email}`, `${getDate()} (Computer)`,]);
  addToMaster(email, phone);

	// Create draft email and mark with uuid label
  log('Creating draft email');
	let myLabel = GmailApp.createLabel(`${jobID}`);
	try {
		let myDraft = GmailApp.createDraft(
			`${email}`,
			`Thank You For Contacting Us About Our Study...`,
			``,
			{
				name: `UCLA Translational Neuroimaging Lab`,
				htmlBody: `<p>Hello,</p><p>Thank you for contacting the Translational Neuroimaging Lab at UCLA. In order to find out if you're eligible for the research study, we will need to set up a time to speak on the phone. When we talk, I can tell you more about the study. If you decide you're interested in participating, I'll ask you questions to determine your eligibility. We will need about 10-15 minutes, and it would be good for you to be in a private location where you can speak freely.</p><p>Please reply to this message with your phone number and a few dates and times that you can speak freely on the phone for <strong>10-15 minutes</strong>. We have the most availability during business hours <strong>(9am-5pm Monday through Friday)</strong>.</p><p>Sincerely,<br>Translational Neuroimaging Research Team</p><p style='font-size: .75rem; color: grey;'>--</p><p style='font-size: .75rem; color: grey;'>Translational Neuroimaging Lab</p><p style='font-size: .75rem; color: grey;'>Department of Psychiatry & Biobehavioral Sciences</p><p style='font-size: .75rem; color: grey;'>University of California, Los Angeles</p><p><a href='https://www.translational-neuroimaging.com/' style='font-size: .75rem;'>https://www.translational-neuroimaging.com/</a></p><p><a href='tel:4245323802' style='font-size: .75rem;'>424-532-3802</a></p>`,
			});
		  myDraft.getMessage().getThread().addLabel(myLabel);
	  } catch (e) {
			warning(`Unable to create email draft to ${email}`);
	}
}

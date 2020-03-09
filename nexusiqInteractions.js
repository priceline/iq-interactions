'use strict';

const axios = require('axios');
const https = require('https');
const fs = require('fs');

const { nexusiq } = JSON.parse([fs.readFileSync(`${process.env.envVars}`)]);
if (process.env.pcln) https.globalAgent.options.ca = [fs.readFileSync(`${process.env.ssCert}`)]; // For use with self-signed certificates

// Get application id
function getNexusIQAppId(application) {
  const options = {
    url: `https://${nexusiq.domain}/api/v2/applications/`,
    method: 'GET',
    headers: {
      Authorization: nexusiq.authRead,
    },
  };

  return !application ? { error: true, reason: 'missing required arg: application' } :
    axios(options).then((response) => {
      if (response.error) {
        return { error: true, reason: response.error };
      } else if (response.status !== 200) {
        return { error: true, reason: 'non-200 response. nexusiq service may be down.' };
      }
      let iqAppId;

      const isAppInNexusIQ = response.data.applications.some((app) => {
        if (app.name.toLowerCase() === application.toLowerCase()) {
          iqAppId = app.id;
          return true;
        }
        return false;
      });

      return !isAppInNexusIQ ? { error: true, reason: 'application not found in nexusiq.' } : iqAppId;
    }).catch((err) => {
      return { error: true, reason: err };
    });
}
exports.getNexusIQAppId = getNexusIQAppId;

// Get report id. If an iqReportId is specified (from Bamboo typically), validate that is matches the the report id determined from the iqAppId
function getNexusIQReportId(iqAppId, iqReportId, tStage) {
  const targetStage = tStage || 'stage-release';
  const options = {
    url: `https://${nexusiq.domain}/api/v2/reports/applications/${iqAppId}`,
    method: 'GET',
    headers: {
      Authorization: nexusiq.authRead,
    },
  };

  return !iqAppId ? { error: true, reason: 'missing required arg: iqAppId' } :
    axios(options).then((response) => {
      if (response.error) {
        return { error: true, reason: response.error };
      } else if (response.status === 404) {
        return { error: true, reason: `the iqAppId ${iqAppId} has no matching application in nexusiq.` };
      } else if (!response.data) {
        return { error: true, reason: 'there was an error getting data for this application from nexusiq.' };
      }
      const stageData = response.data.filter((s) => s.stage === targetStage);
      if (stageData.length === 0) return { error: true, iqAppId, reason: `no "${targetStage}" report found` };

      const temp = stageData[0].reportHtmlUrl.split('/');
      const iqReportIdDetermined = temp[temp.length - 1];

      return (iqReportId && (iqReportId !== iqReportIdDetermined)) ?
        { error: true, iqAppId, iqReportId, reason: 'iqReportId mismatch. in bamboo, check the target application for the nexusiq task' } : iqReportIdDetermined;
    });
}
exports.getNexusIQReportId = getNexusIQReportId;

// Get the nexusiq report score(s) for the application/iqReportId combination. NOTE: the iqReportId is specifc to the tStage used in getNexusIQReportId()
function getNexusIQReportScores(application, iqReportId) {
  const options = {
    url: `https://${nexusiq.domain}/rest/report/${application}/${iqReportId}/browseReport/data.json`,
    method: 'GET',
    headers: {
      Authorization: nexusiq.authRead,
    },
  };

  return !(application && iqReportId) ? { error: true, reason: 'missing required args: application && iqReportId' } :
    axios(options).then((response) => {
      if (response.error) {
        return { error: true, reason: response.error };
      } else if (response.status !== 200) {
        return { error: true, reason: 'no nexusiq report found for this application/iqReportId combination.' };
      } else if (!response.data) {
        return { error: true, reason: 'there was an error getting data for this application from nexusiq.' };
      }
      // NOTE: policyCounts reads as lowest policy violations to highest [# of 1s, 2s, 3s, ...10s]
      return response.data;
    });
}
exports.getNexusIQReportScores = getNexusIQReportScores;

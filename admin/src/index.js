const express = require("express")
const bodyParser = require("body-parser")
const config = require("config")
const request = require("request")
const axios = require("axios")

const app = express()

app.use(bodyParser.json({limit: "10mb"}))

// Axios Call to URL and method, replaces deprecated request module
let callAPI = async(url, method, headers,data) => {
  callConfig = {
    method,
    url,
    headers,
    data
  };
  response = await axios(callConfig);
  console.log(url+': ' + response.status)
  return response;
};

// gets list of comapnies for export
const getCompanies = async(headers, data) =>{

  let url = `${config.financialServiceUrl}/companies`;
  let companies = await callAPI(url, 'GET', headers, data);
  return companies;

}

const formatJSON = async(companiesData, investmentData) =>{
  var obj = []
  //Loops through each object in the list, along with each nested holdings list, parsing the required data into a formatted list.
  for(var i = 0; i < investmentData.length; i++){
    for (var j = 0; j < investmentData[i].holdings.length; j++){
      jsonContents = {};
      jsonContents["User"] = investmentData[i].userId;
      jsonContents["First Name"] = investmentData[i].firstName;
      jsonContents["Last Name"] = investmentData[i].lastName;
      jsonContents["Date"] = investmentData[i].date;
      for(var x =0; x < companiesData.length; x++){
        // compares values, and pulls out the assosiated name
        if (companiesData[x].id === investmentData[i].holdings[j].id){
          jsonContents["Holding"] = companiesData[x].name;
        }
      }
      jsonContents["Value"] = investmentData[i].holdings[j].investmentPercentage * investmentData[i].investmentTotal
      //updates an empty json with the formated object in for each value in the nested holdings, in each object in the intial list
      obj.push(jsonContents)
    }

  
  
  }
  return obj

}

const generateCSV = async(formattedJSON) =>{
  // uses keys from the formatted JSON to dictate headers
  const csvHeader = Object.keys(formattedJSON[0]);
  //Joins headers
  const csvHeaderString = csvHeader.join(',');
  // sets any null/undefined values as empty for the csv 
  const replacer = (key, value) => value ?? '';
  // converts each object in formatted json into a string, joining the values
  const csvRows = formattedJSON.map((row)=>
    csvHeader.map((fieldName) => JSON.stringify(row[fieldName], replacer))
    .join(',')
  );
  // combines headers and rows, with each row seperated by a newline
  const csv = [csvHeaderString, ...csvRows].join('\r\n');
  
  const finalCSV = `{csv:'` + csv+`'}`
  return finalCSV
}

app.get("/investments/:id", (req, res) => {
  const {id} = req.params
  request.get(`${config.investmentsServiceUrl}/investments/${id}`, (e, r, investments) => {
    if (e) {
      console.error(e)
      res.sendStatus(500)
    } else {
      res.send(investments)
    }
  })
})


app.get("/export/investments", async(req, res) => {
  let url = `${config.investmentsServiceUrl}/investments`
  headers = {}
  data = {}
  try {
    // retrieves list of investments
    investments = await callAPI(url, 'GET', headers,data)
    if (investments.status === 200){
      investmentData = investments.data;
      //retrieves list of companies
      companies = await getCompanies(headers, data);
      companiesData = companies.data;

      // formats JSON to be converted to CSV
      formattedJSON = await formatJSON(companiesData, investmentData);

      let url = `${config.investmentsServiceUrl}/investments/export`;

      data = formattedJSON;
      //sets headers
      headers = {
        "content-type": "application/json"
      }
      // posts to investments services
      exportCall = await callAPI(url, 'POST', headers, data);
      //checks post was successful
      if (exportCall.status === 204){
        //Generates CSV from FormattedJSON
        csvFile = await generateCSV(formattedJSON);
        //sets header for response
        res.setHeader('content-type', 'text/csv');
        //sends response csv
        res.send(csvFile)
      }else{
        res.sendStatus(500)
        res.send({"Failure_Reason": "Failure in Posting Report"})
      }
      // converts formatted JSON to CSV
      

    } else{
      res.sendStatus(500)
    }
  }
  catch (error){
    console.log(error);
    res.sendStatus(500)
  }
})

app.listen(config.port, (err) => {
  if (err) {
    console.error("Error occurred starting the server", err)
    process.exit(1)
  }
  console.log(`Server running on port ${config.port}`)
})


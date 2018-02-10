//Dependencies for the build  
var https = require("https");
var http = require("http");
var url = require("url");
var fs = require('fs');
var node_static = require('node-static');
var AWS = require('aws-sdk');
var randomKey = require('key-forge').randomKey;
var twilio = require('twilio');
var config = require('./config/config');

var client = new twilio.RestClient(config.accountSid, config.authToken);

// Loading private key and certificate for HTTPS request which allows us to create a secure connection
options = {
    key: fs.readFileSync('./pemfiles/private-key.pem'),
    cert: fs.readFileSync('./pemfiles/certificate.pem')
}

// Creating a static public file server with the help of node-static module
var file_server = new node_static.Server('./public');

var UserSessions = [];

// Setting the byte length of key-forge module token.
var key_size = 32;

/**
 * Function to check for unsecured HTTP connection
 * If request comes it reroutes them to http port
 */
function OnUnsecuredRequest(request, response) {
    var host = request.headers.host;
    var path = url.parse(request.url).pathname;
    var new_url = "https://" + host + path;

    response.writeHead(301,
        {"Location": new_url}
    );
    response.end();
}

/**
 *  Function to control the Server response methods - GET and POST
 */

function OnRequest(request, response) {
    // First, we sort requests based on the HTTP verb that's used.
    if (request.method == "GET") {
        getRequests(request, response);
    }
    else if (request.method == "POST") {
    // Calling AWS with the credentials
        postRequests(request, response)
    }
    else {
        response.writeHead(400);
        response.write("This HTTP verb is currently not supported.");
        response.end();
    }
}

/**
 * Function for managing requests
 */
function getRequests(request, response) {
    // Parse the incoming request for the requested filename.
    var pathname = url.parse(request.url).pathname;

    if (pathname == "/") {
        file_server.serveFile("./views/home.html", 200, {}, request, response);
    }

    request.addListener('end', function () {
        file_server.serve(request, response, function (error, result) {
            if (error) {
                console.log("Error Occurred!!!");
            }
        });

    }).resume();
}

/**
 * Handles POST request
 */
function postRequests(request, response) {
    var pathname = url.parse(request.url).pathname;

    //login endpoint
    if (pathname == "/login") {
        request.setEncoding('utf8')

        request.on('data', function (chunk) {
            var creds = chunk.split(",");
            console.log("**************************************************************************");
            console.log("@@@@@ Credential keyId -> " + creds[0] + " secretAccessKey -> " + creds[1] + " regionValue -> " + creds[2]);
            console.log("**************************************************************************");

            AWS.config = {
                accessKeyId: creds[0],
                secretAccessKey: creds[1],
                region: creds[2],
                sslEnabled: true
            }

            //Generating new token for every new user
            var generated_token = GenerateToken();

            // Connecting to the AWS Ec2
            var ec2 = new AWS.EC2();


            ec2.describeInstances({}, function (error, data) {
                if (error) {
                    // Send error response to browser.
                    response.writeHead(502);
                    response.write(error.message);
                    response.end();
                }
                else {
                    var instance_list = "";
                    var match_list = "";

                    for (var i = 0; i < data.Reservations.length; i++) {
                        for (var j = 0; j < data.Reservations[i].Instances.length; j++) {
                            instance_list += data.Reservations[i].Instances[j].InstanceId;

                            for (var k = 0; k < data.Reservations[i].Instances[j].Tags.length; k++) {
                                match_list += data.Reservations[i].Instances[j].Tags[k].Key +
                                    ": " + data.Reservations[i].Instances[j].Tags[k].Value;

                                if (k != data.Reservations[i].Instances[j].Tags.length - 1) {
                                    match_list += ",";
                                }
                            }

                            if (j != data.Reservations[i].Instances.length - 1) {
                                instance_list += ",";
                                match_list += ";";
                            }
                        }

                        if (i != data.Reservations.length - 1) {
                            instance_list += ",";
                            match_list += ";";
                        }
                    }


                    // Requesting Tag names of the instances from AWS
                    ec2.describeTags({}, function (error, data) {
                        if (error) {
                            response.writeHead(502);
                            response.write(error.message);
                            response.end();
                        }
                        else {
                            var tag_list = "";
                            for (var i = 0; i <= data.Tags.length - 1; i++) {
                                tag_list += data.Tags[i].Key + ": " + data.Tags[i].Value

                                if (i != data.Tags.length - 1) {
                                    tag_list += ",";
                                }
                            }

                            temp = {
                                token: generated_token.token,
                                expiration: generated_token.expiration,
                                credentials: AWS.config
                            };
                            UserSessions.push(temp);

                            // Build the response string from the token and other substrings.
                            var response_string = generated_token.token + ";" + instance_list + ";" + tag_list + ";" + match_list;
                            console.log("**************************************************************************");
                            console.log("@@@@@ Credential response_string -> " + response_string);
                            console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                            console.log("@@@@@ generated_token " + generated_token.token);
                            console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                            console.log("@@@@@ instance_list " + instance_list);
                            console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                            console.log("@@@@@ tag_list " + tag_list);
                            console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
                            console.log("@@@@@ match_list " + match_list);
                            console.log("**************************************************************************");

                            // Return this string to the browser.
                            response.writeHead(200);
                            response.write(response_string);
                            response.end();

                        }

                    });

                }

            });

        });
    }
    // Pull metrics endpoint
    else if (pathname == "/pull_metrics") {
        request.setEncoding('utf8')
        request.on('data', function (chunk) {

            var mini_chunks = chunk.split(";");
            var token = mini_chunks[0];
            var time = mini_chunks[1].split(",");

            var token_found = false;
            for (var i = 0; i < UserSessions.length; i++) {
                if (UserSessions[i].token == token) {
                    // User token has been authenticated
                    token_found = true;
                    AWS.config = UserSessions[i].credentials
                    break;
                }
            }

            // Token expired or corrupted
            if (token_found == false) {
                response.writeHead(401);
                response.write("Access Denied");
                response.end();
                return;
            }

            // Handle for cloudwatch api
            var cloudwatch = new AWS.CloudWatch();

            var namespace;

            // namespaces for default metrics and custom 
            if (String(mini_chunks[3]) == "MemoryUtilization") {
                namespace = "System/Linux"
            }
            else {
                namespace = "AWS/EC2"
            }
            
			// params to be used as argument in get metric statistics 
            var params = {
                StartTime: String(time[0]),
                EndTime: String(time[1]),
                Period: String(time[2]),
                Namespace: namespace,
                MetricName: String(mini_chunks[3]),
                Statistics: ['Average'],
                Dimensions: [
                    {
                        Name: 'InstanceId',
                        Value: String(mini_chunks[2])
                    }
                ]
            };

            // Requesting AWS cloudwatch for metrics
            cloudwatch.getMetricStatistics(params, function (error, data) {
                if (error) {
                    response.writeHead(502);
                    response.write(error.message);
                    response.end();
                }
                else {
                    var message = "";
                    for (var i = 0; i < data.Datapoints.length; i++) {
                        message += data.Datapoints[i].Timestamp + "," + data.Datapoints[i].Average;

                        //Sending message to the configured mobile number using Twillio service 
                        if ((data.Datapoints[i].Average > config.memoryThreshold && data.Datapoints[i].Unit == 'Percent' && mini_chunks[3] == "MemoryUtilization" ) || (data.Datapoints[i].Average > config.cpuThreshold && data.Datapoints[i].Unit == 'Percent' && mini_chunks[3] == "CPUUtilization" )) {
                            client.messages.create({
                                to: "6692219819",
                                from: "+12244073238",
                                body: 'Hello Sir, Your ' + String(mini_chunks[3]) + ' for Instance ID: ' + mini_chunks[2] + ' has gone above threshold at ' + mini_chunks[1] + ' Thanks, Jarvis'
                            }, function (error, message) {
                                if (error) {
                                    console.log(error.message);
                                }
                            });

                        }

                        if (i < data.Datapoints.length - 1) {
                            message += ";"
                        }
                    }
                    response.writeHead(200);
                    response.write(message); // message rendered to the client
                    response.end();
                }
            });
        });
    }

}

/**
 * Standalone function to generate user token for authentication purpose
 */

function GenerateToken() {
    var temp_token = randomKey(key_size);

    var is_unique = false;
    while (is_unique == false) {
        is_unique = true;

        for (var i = 0; i < UserSessions.length; i++) {
            if (UserSessions[i].token == temp_token) {
                temp_token = randomKey(key_size);
                is_unique = false;
                break;
            }
        }
    }

    // Setting the validity of the token for 24 hours
    d = new Date();
    expiration = d.getTime();
    expiration += 24 * 60 * 60 * 1000;

    return {
        token: temp_token,
        expiration: expiration
    };
}

/**
 // Function to clear expired tokens
 */

function ClearExpiredTokens() {
    d = new Date();
    current_time = d.getTime();

    var total_cycles = UserSessions.length;
    var adjustment = 0;

    for (var i = 0; i <= total_cycles-1; i++) {
        if (UserSessions[i + adjustment].expiration < current_time) {
            UserSessions.splice(i + adjustment, 1);
            adjustment--;
        }
    }
    callback = function () {
        ClearExpiredTokens();
    };

    prune_id = setTimeout(callback, 60 * 60 * 1000);
}


https.createServer(options, OnRequest).listen(443);

http.createServer(OnUnsecuredRequest).listen(80);

console.log("Secure HTTPS server running on port 443");

ClearExpiredTokens();

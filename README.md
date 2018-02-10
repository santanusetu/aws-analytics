# CMPE273-AWS-Project

Screenshot of the Login page:


![ScreenShot](/screenshots/awsConsoleScreenshot.png)

Screenshot of the AWS console graphs:


![ScreenShot](/screenshots/awsConsoleGraphs.png)

Screenshot of the AWS console in when accessed through mobile:


![ScreenShot](/screenshots/mobileScreenshot.png)  


##Installation and execution
<pre>
•	First Install Node.js and npm
•	Clone this repository
•	Install all the dependencies ===> npm install
•	Place a security certificate and a private key in a folder named "security". Now you need to get a certificate from a CA or create a     self-signed certificate using OpenSSL.
    openssl genrsa -out privatekey.pem 1024
    openssl req -new -key privatekey.pem -out certrequest.csr
    openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem
•	Run the server ====> node server.js
•	Put IP address of the remote server in your browser, or just type in 'localhost' if you are testing this on your personal machine. 

Now you should see a web page ready to accept your AWS login.
</pre>

##Configuration
<pre>
•	Under config folder, use config.js file to customize the memory and cpu threshold for alert notifications
•	AccountSid and authid, need to be provided for twilio service.
</pre>


##Technologies Used
<pre>
Node.js http://www.nodejs.org
Node Community Modules: 'aws-sdk', 'key-forge', 'node-static', 'twilio'
Boootstrap http://getbootstrap.com/
jQuery https://jquery.com/
HighCharts http://www.highcharts.com/
</pre>

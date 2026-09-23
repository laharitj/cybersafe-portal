const getResetServiceUrl = () => window.RESET_SERVICE_URL || "http://127.0.0.1:49671";
window.handleResetToken = function(token) {
if (!token) return;
const input = document.getElementById("resetEmail");
if (input) input.value = token;
const msg = document.getElementById("resetMsg");
if (msg) msg.innerText = "Reset link opened. Use the token in the app.";
};
let masterPIN="";
let accounts=[];

// Show setup screen for new users, login screen for existing vaults
function showInitialScreen(){
document.getElementById("setupPage").classList.add("hidden");
document.getElementById("loginPage").classList.add("hidden");

if(localStorage.getItem("vault")){
document.getElementById("loginPage").classList.remove("hidden");
}else{
document.getElementById("setupPage").classList.remove("hidden");
}
}

document.addEventListener("DOMContentLoaded", showInitialScreen);

// Manual navigation between sign up and sign in screens
function showSetupPage(){
document.getElementById("loginPage").classList.add("hidden");
document.getElementById("setupMsg").innerText="";
document.getElementById("setupPage").classList.remove("hidden");
}

function showLoginPage(){
document.getElementById("setupPage").classList.add("hidden");
document.getElementById("loginMsg").innerText="";
document.getElementById("loginPage").classList.remove("hidden");
}

// Create Vault (new user)
function createVault(){

const pin=document.getElementById("setupPin").value;
const confirmPin=document.getElementById("setupPinConfirm").value;
const message=document.getElementById("setupMsg");

if(!/^\d{6}$/.test(pin)){
message.innerText="PIN must be 6 digits";
return;
}

if(pin!==confirmPin){
message.innerText="PINs do not match";
return;
}

if(localStorage.getItem("vault") && !confirm("A vault already exists. Creating a new one will erase it. Continue?")){
return;
}

masterPIN=pin;
accounts=[];
updateStorage();

document.getElementById("setupPage").classList.add("hidden");
document.getElementById("vaultPage").classList.remove("hidden");
displayAccounts();

}

// Unlock Vault

function unlockVault(){

const pin=document.getElementById("masterPin").value;

if(pin.length!==6){
document.getElementById("loginMsg").innerText="PIN must be 6 digits";
return;
}

masterPIN=pin;

const encrypted=localStorage.getItem("vault");

if(encrypted){

try{

const bytes=CryptoJS.AES.decrypt(encrypted,pin);

const decrypted=bytes.toString(CryptoJS.enc.Utf8);

accounts=JSON.parse(decrypted);

}catch{

document.getElementById("loginMsg").innerText="Wrong Master PIN";

return;

}

}

document.getElementById("loginPage").classList.add("hidden");

document.getElementById("vaultPage").classList.remove("hidden");

displayAccounts();

}

// Encrypt and Save

function updateStorage(){

const encrypted=CryptoJS.AES.encrypt(

JSON.stringify(accounts),
masterPIN

).toString();

localStorage.setItem("vault",encrypted);

}

// Save Account

function saveAccount(){

const website=document.getElementById("website").value.trim();

const username=document.getElementById("username").value.trim();

const password=document.getElementById("password").value.trim();

if(!website || !username || !password){

alert("Fill all fields");

return;

}

accounts.unshift({website,username,password});

updateStorage();

document.getElementById("website").value="";

document.getElementById("username").value="";

document.getElementById("password").value="";

displayAccounts();

}

// Display

function displayAccounts(){

const key=document.getElementById("search").value.toLowerCase();

const list=document.getElementById("accountList");

list.innerHTML="";

const filtered=accounts.filter(a=>

a.website.toLowerCase().includes(key) ||

a.username.toLowerCase().includes(key)

);

if(filtered.length===0){

list.innerHTML="<p>No accounts saved.</p>";

return;

}

filtered.forEach((acc,index)=>{

list.innerHTML+=`

<div class="item" onclick="showDetails(${accounts.indexOf(acc)})">

<div class="website">${acc.website}</div>

<div class="user">👤 ${acc.username}</div>

<div class="pass">🔑 •••••••••</div>

<div class="actions">

<button class="copy"
onclick="event.stopPropagation(); copyPass('${acc.password.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')">

Copy

</button>

<button class="delete"

onclick="event.stopPropagation(); removeAccount(${accounts.indexOf(acc)})">

Delete

</button>

</div>

</div>

`;

});

}

// Copy

function copyPass(text){

navigator.clipboard.writeText(text);

alert("Password Copied!");

}

// Delete

function removeAccount(index){

if(confirm("Delete account?")){

accounts.splice(index,1);

updateStorage();

displayAccounts();

}

}

// Show Password Input

function toggleInput(){

const p=document.getElementById("password");

p.type=p.type==="password"?"text":"password";

}

// Logout

function logout(){

location.reload();

}

function openForgotPassword(){
document.getElementById("resetEmail").value="";
document.getElementById("resetMsg").innerText="";
document.getElementById("forgotModal").classList.remove("hidden");
document.getElementById("resetEmail").focus();
}

function closeForgotPassword(){
document.getElementById("forgotModal").classList.add("hidden");
}

async function requestPasswordReset(){
const email=document.getElementById("resetEmail").value.trim();
const message=document.getElementById("resetMsg");

if(!email || !email.includes("@")){
message.innerText="Enter a valid email address";
return;
}

message.innerText="Sending reset request...";

try{
const resetUrl = getResetServiceUrl();
const response=await fetch(`${resetUrl}/forgot-password`,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({email})
});
const result=await response.json();

if(!response.ok){
throw new Error(result.error || "Request failed");
}

message.innerText=result.email_sent
?"Reset email sent. Check your inbox."
:"Reset request recorded. Configure SMTP to send email.";
}catch(error){
message.innerText=error.message || "Could not connect to reset service";
}
}

// Show account details
function showDetails(index){

const account=accounts[index];

if(!account){
return;
}

document.getElementById("detailsWebsite").innerText=account.website;
document.getElementById("detailsUsername").innerText=account.username;
document.getElementById("detailsPassword").value=account.password;
document.getElementById("detailsPassword").type="password";
document.getElementById("detailsModal").classList.remove("hidden");

}

function closeDetails(){
document.getElementById("detailsModal").classList.add("hidden");
}

function toggleDetailsPassword(){
const password=document.getElementById("detailsPassword");
password.type=password.type==="password"?"text":"password";
}
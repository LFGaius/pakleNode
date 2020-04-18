const express=require('express');
const cookieParser=require('cookie-parser');
const nodemailer=require('nodemailer');
const bodyParser=require('body-parser');
const {check,validationResult}=require('express-validator');
const mysql=require('mysql');
const bcrypt=require('bcrypt');
const app=express();
const {generateCode} = require('./actions');
require('dotenv').config()

//to define elsewhere
process.env.SENDEREMAIL="liburialgaius@gmail.com";
process.env.SENDERPASSWORD="libure123";
//

let code;

const transporter= nodemailer.createTransport({
    service:'gmail',
    secure:true,
    auth:{
        user:process.env.SENDEREMAIL,
        pass:process.env.SENDERPASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// let transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 465,
//     secure: true,
//     auth: {
//         type: 'OAuth2',
//         user: 'liburialgaius@gmail.com',
//         clientId: '146877350313-e3nss0abbgqcf71p93e87qik56cj8cl1.apps.googleusercontent.com',
//         clientSecret: 'jzY1Gadain1IKX-u_r9E0YK8'
//     },
//     tls: {
//         rejectUnauthorized: false
//     }
// });
// const jsonParser=bodyParser.json();
// const urlEncodedParser=bodyParser.urlencoded({extended:false});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));

const connection=mysql.createConnection({
    host:'localhost',
    user:'root',
    password:'',
    database:'pakle'
});

connection.connect((err)=>{
    if(err) console.log('DB connection error!');
    else    console.log('connected as id ' + connection.threadId);
});

app.post('/login',(req,res)=>{
    res.sendStatus(200);
});

app.post('/signup',[check('username','The name is required!').not().isEmpty(),
check('email','The given email is not valid!').isEmail(),
check('password','The password size must be at least equal to 6').isLength({min:6})],(request,response)=>{
    const errors=validationResult(request);
	if(errors.errors.length>0)
        response.status(400).send(errors.mapped());
    else{
        const userData={username:request.body.username,email:request.body.email,password:request.body.password};
        connection.query(`select id from user where username=? OR email=?`,[userData.username,userData.email],(err,res)=>{
            if(err) throw err;
            else{
                if(res.length>0)
                    response.status(500).send({globalError:{msg:'Username or Email already existing!'}});
                else{
                    handleCodeGeneration(30000);
                    response.status(200).send(userData);
                }
                    // connection.query(`insert into user SET ?`,userData,(err,res)=>{
                    //     if(err) throw err;
                    //     response.status(200).send(userData);
                    // }
                    // );
            }
         }
        );
    }
    
});

app.post('/verification',(req,res)=>{
    //req.body.userData
    
    res.status(200).send(code);
});

app.post('/resendcode',(req,res)=>{
    //req.body.userData
    handleCodeGeneration(120000);
    res.status(200).send(code);
    // res.sendStatus(200);
});

function handleCodeGeneration(delay){//in milliseconds
    code={value:generateCode(),expired:false};
    const mail={
        from: "liburialgaius@gmail.com", // sender address
        to: "liburialgaius@gmail.com", // list of receivers
        subject: "Code verification", // Subject line
        // text: "Hello world?", // plain text body
        html: `Hello! Your verification code is <b>${code.value}</b> ! It will expire in 2 minutes!` // html body
    };
    let info = transporter.sendMail(mail,(error,info)=>{
        if(error)
            console.log('Error when sending the mail!'+error);
        else
            console.log('Mail sent successfully!');
    });
    setTimeout(()=>{code={...code,expired:true}},delay);
}



app.listen(3000);
const express=require('express');
const cookieParser=require('cookie-parser');
const nodemailer=require('nodemailer');
const bodyParser=require('body-parser');
const {check,validationResult}=require('express-validator');
const mysql=require('mysql');
const bcrypt=require('bcrypt');
const saltRounds = 10;
const app=express();
const {generateCode} = require('./actions');

require('dotenv').config();

//test with many users
let codes=[];
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



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));
// we will use pooling connection in the future(to improve performances) 
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

app.post('/login',[check('email','The given email is not valid!').isEmail(),
check('password','The password field must be filled').not().isEmpty()],(request,response)=>{
    const errors=validationResult(request);
	if(errors.errors.length>0){
        response.status(400).send(errors.mapped());
    }else{
        
        connection.query(`select id,password,username from user where email=?`,[request.body.email],(err,res)=>{
            if(err) throw err;
            else{
                if(res.length>0){
                    if(bcrypt.compareSync(request.body.password, res[0].password)){
                        const userData={id:res[0].id,username:res[0].username,email:request.body.email,password:request.body.password};
                        handleCodeGeneration(120000,request.body.email)
                        .then(()=>{
                            response.status(200).send(userData);
                        })
                        .catch(()=>{
                            response.status(500).send({globalError:{msg:'Sending code error!'}});
                        });
                    }else
                        response.status(500).send({globalError:{msg:'Invalid Password!'}});
                    
                }else
                    response.status(500).send({globalError:{msg:'Unknown Account!'}});
            }
         }
        );
    }
});

app.post('/recoveryinfo',[],(request,response)=>{
	if(request.body.info=='' || !request.body.info){
        response.status(400).send({globalError:{msg:'The field must be defined!'}});
    }else{
        connection.query(`select username,email from user where email=? OR username=?`,[request.body.info,request.body.info],(err,res)=>{
            if(err) throw err;
            else{
                if(res.length>0){
                    const userData={username:res[0].username,email:res[0].email};
                    handleCodeGeneration(120000,res[0].email)
                    .then(()=>{
                        response.status(200).send(userData);
                    })
                    .catch(()=>{
                        response.status(500).send({globalError:{msg:'Sending code error!'}});
                    });
                }else
                    response.status(500).send({globalError:{msg:'Unknown Account!'}});
            }
         }
        );
    }
});

app.post('/signup',[check('username','The username is required!').not().isEmpty(),
check('email','The given email is not valid!').isEmail(),
check('password','The password size must be at least equal to 6').isLength({min:6})],(request,response)=>{
    const errors=validationResult(request);
	if(errors.errors.length>0){
        response.status(400).send(errors.mapped());
    }else{
        if(request.body.password!=request.body.rpassword){
            response.status(400).send({globalError:{msg:'Password fields must match!'}});
        }else{
            const userData={username:request.body.username,email:request.body.email,password:request.body.password};
            connection.query(`select id from user where username=? OR email=?`,[userData.username,userData.email],(err,res)=>{
                if(err) throw err;
                else{
                    if(res.length>0)
                        response.status(500).send({globalError:{msg:'Username or Email already existing!'}});
                    else{
                        handleCodeGeneration(120000,"liburialgaius@gmail.com")
                        .then(()=>{
                            console.log('good');
                            response.sendStatus(200);
                        })
                        .catch(()=>{
                            response.status(500).send({globalError:{msg:'Sending code error!'}});
                        })
                            
                    }
                }
            }
            );
        }
    }
    
});

app.post('/changepass',[
check('password','The password size must be at least equal to 6').isLength({min:6})],(request,response)=>{
    const errors=validationResult(request);
	if(errors.errors.length>0)
        response.status(400).send(errors.mapped());
    else{
        if(request.body.password!=request.body.rpassword)
            response.status(400).send({globalError:{msg:'Password fields must match!'}});
        else{
            const hashpass = bcrypt.hashSync(request.body.password, saltRounds);
            const userData={email:request.body.email,password:hashpass};
            connection.query('UPDATE user set password=? WHERE email=?', [hashpass, request.body.email], function (error, results, fields) {
                if (error) throw error;
                response.status(200).send(userData);
            });
        }
    }
    
});

app.post('/verification',(request,response)=>{
    const ind=codes.findIndex(e=>e.email===request.body.userData.email);
    if(request.body.code===codes[ind].value){
        if(!codes[ind].expired)
            switch(request.body.optype){
                case 'signup':
                    const hashpass = bcrypt.hashSync(request.body.userData.password, saltRounds);
                    const userData={username:request.body.userData.username,email:request.body.userData.email,password:hashpass};
                    connection.query(`insert into user SET ?`,userData,(err,res)=>{
                            if(err) throw err;
                            response.status(200).send({message:'verified',userData:{...userData,id:res.insertId}});
                        }
                    );
                break;
                case 'login':
                    response.status(200).send({message:'verified',userData:request.body.userData});
                break;
                case 'forgottenpass':
                    response.status(200).send({message:'verified',userData:request.body.userData});
                break;
                case 'recoveryinfo':
                    response.status(200).send({message:'verified',userData:request.body.userData});
                break;
            }
        else
            response.status(200).send({message:'codeexpired',userData:request.body.userData}); 

    }else{
       response.status(200).send({message:'notverified',userData:request.body.userData});
    }
});

app.post('/sendcode',(req,res)=>{
    handleCodeGeneration(120000,req.body.email)
    .then(()=>{
        res.sendStatus(200);
    })
    .catch(()=>{
        res.sendStatus(500);
    });
});

function handleCodeGeneration(delay,emailTo){//in milliseconds
    let ind=codes.findIndex(e=>e.email===emailTo);
    if(ind!=-1)
        codes[ind]={value:generateCode(),expired:false,email:emailTo};
    else{
        codes=[{value:generateCode(),expired:false,email:emailTo},...codes];
        ind=0;
    }

    console.log(`${codes[ind].value}`);
    
    const mail={
        from: "liburialgaius@gmail.com", // sender address 
        to: emailTo, // list of receivers
        subject: "Code verification", // Subject line
        // text: "Hello world?", // plain text body
        html: `Hello! Your verification code is <b>${codes[ind].value}</b> ! It will expire in 2 minutes!` // html body
    };
    setTimeout(()=>{codes[ind]={...codes[ind],expired:true}},delay);
    return Promise.resolve();//auto resolve promise just for testing
    // return  new Promise((resolve,reject)=>{
    //             transporter.sendMail(mail,(error,info)=>{
    //                 if(error){
    //                     console.log('Error when sending the mail!'+error);
    //                     reject();
    //                 }else{
    //                     console.log('Mail sent successfully! '+JSON.stringify(codes[ind]));
    //                     setTimeout(()=>{codes[ind]={...codes[ind],expired:true}},delay);
    //                     resolve();
    //                 }
    //             });
    //         });
}



app.listen(3000);
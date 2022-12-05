const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
//email sen message booking
const mg = require('nodemailer-mailgun-transport');
const port = process.env.PORT || 5000;

const app = express();
require('dotenv').config();
//middleware
app.use(cors());
app.use(express.json())

//mongoDb altes
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@rasel-01.uhpxwkk.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

//send bookin user email send
function sendBookingEmail(booking) {
    const { email, treatment, appointmentDate, slots } = booking;

    const auth = {
        auth: {
            api_key: process.env.EMAIL_SEND_KEY,
            domain: process.env.EMAIL_SEND_DOMEN
        }
    }

    const transporter = nodemailer.createTransport(mg(auth));

    if (email) {
        transporter.sendMail({
            from: 'johirulislam574206@gmail.com',
            to: email,
            subject: `Dental ${treatment} Service Booking ${appointmentDate}`,
            //You can use "text:" to send plain-text content. It's oldschool!
            text: 'Hello Dental Present !',
            html: `
        <h3>Hello Dental serveses Bookin present</h3>
        <p>Lorem ipsum, dolor sit amet consectetur adipisicing elit. Adipisci sit in ipsam veritatis voluptates quia veniam cum libero dolore cumque.</p>
         <h4>Thank you for doctor portal</h4>
         <br></br>
        <button>Successfully</button>

        `
        }, (err, info) => {
            if (err) {
                console.log(`Error: ${err}`);
            }
            else {
                console.log(`Response: ${info}`);
            }
        });

    }
}

//JWT verifyToken 
async function verifyJWT(req, res, next) {
    const authHeder = req.headers.authorization;
    if (!authHeder) {
        return res.status(401).send('This parson unAthorizetion access')
    }

    const token = authHeder.split(' ')[1];
    jwt.verify(token, process.env.ACCSS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(402).send({ message: "forbiden access" })
        }

        req.decoded = decoded;
        next()
    })

}

async function run() {

    try {
        const appointMentDate = client.db('Doctor-Portal').collection('appointment-Options');
        const allBokingCollection = client.db('Doctor-Portal').collection('All-Booking');
        const userInformation = client.db('Doctor-Portal').collection('User-Information');
        const doctorCollection = client.db('Doctor-Portal').collection('all_doctors');

        // get all appointMent collctions
        app.get('/appointmentLinst', async (req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointMentDate.find(query).toArray();
            //get ta booking date provide
            const bookingQuery = { appointmentDate: date }
            const alreadyBoking = await allBokingCollection.find(bookingQuery).toArray()
            //filtearing date
            options.forEach(option => {
                const optionBook = alreadyBoking.filter(book => book.treatment === option.name);
                const bookSlot = optionBook.map(book => book.slot);
                const remaingSlot = option.slots.filter(slot => !bookSlot.includes(slot))
                option.slots = remaingSlot;
                console.log("option book", optionBook, date)

            })
            // console.log(options);
            res.send(options);
        })

        app.get('/v2/appointmentLinst', async (req, res) => {
            const date = req.query.date;
            const options = await appointMentDate.aggregate([
                {
                    $lookup: {
                        from: 'All-Booking',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appointmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        })

        /***
         * API Naming Convention 
         * app.get('/bookings')
         * app.get('/bookings/:id')
         * app.post('/bookings')
         * app.patch('/bookings/:id')
         * app.delete('/bookings/:id')
        */

        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {}
            const result = await appointMentDate.find(query).project({ name: 1 }).toArray();
            res.send(result);
        })
        //doctior post collection
        app.post('/doctor', verifyJWT, async (req, res) => {
            const user = req.body;
            const result = await doctorCollection.insertOne(user);
            res.send(result);
        })
        //doctior post collection
        app.get('/doctors', verifyJWT, async (req, res) => {
            const query = {}
            const result = await doctorCollection.find(query).toArray();
            res.send(result);
        })
        //delete
        app.delete('/doctors/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })
        //User email booking lisht
        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: "forbiden access" });
            }
            const query = { email: email };
            const result = await allBokingCollection.find(query).toArray();
            res.send(result);
        })
        //all present booking lisht
        app.get('/all-booking', async (req, res) => {
            const query = {};
            const result = await allBokingCollection.find(query).toArray();
            res.send(result);
        })

        //Booking apoentment
        app.post('/booking', async (req, res) => {
            const userBooking = req.body;
            console.log(userBooking)
            const query = {
                appointmentDate: userBooking.appointmentDate,
                email: userBooking.email,
                treatment: userBooking.treatment
            }
            const alreadyBooking = await allBokingCollection.find(query).toArray()
            if (alreadyBooking.length) {
                const messsage = `This Date All ready have  Booking ? ${userBooking.appointmentDate}`
                return res.send({ acknowledged: false, messsage })
            }
            const result = await allBokingCollection.insertOne(userBooking);
            //about email sMTP user
            sendBookingEmail(userBooking)
            res.send(result);
        })

        // user email, password save database
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await userInformation.insertOne(user);
            res.send(result);
        })
        app.get('/users', async (req, res) => {
            const query = {}
            const result = await userInformation.find(query).toArray();
            res.send(result);
        })

        //admin panal =============>
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await userInformation.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })

        app.put('/users/admin/:id', verifyJWT, async (req, res) => {

            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userInformation.findOne(query);
            console.log(user)
            if (user.role !== 'admin') {
                return res.status(403).send({ message: "NOT Admin" })
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userInformation.updateOne(filter, updateDoc, options);
            res.send(result);
        })

        //Jwt token access
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await userInformation.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCSS_TOKEN, { expiresIn: '1h' });
                return res.send({ accessToken: token })
            }
            console.log(user);
            res.status(403).send({ accessToken: '' })
        })


    }
    catch (error) {
        console.log(error.name, error.message, error.stack);
    }

}

run().catch(error => console.log(error))


app.get('/', (req, res) => {
    res.send('doctor server is run ')
})
app.listen(port, () => console.log(`Doctor site runing ${port}`))
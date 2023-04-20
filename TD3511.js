var aesjs = require('aes-js');
var { SerialPort } = require('serialport')

var path = "0_userdata.0.td3511";
var key_128 = "********************************";
var usbPath = '/dev/ttyUSB'; 
const bySerial = true;
const usbSerial = '86498b1fbceeec11950d30f90f611b40';

//Create states
createStates(path);
//Timeout
resetSerialPortTimeout();

//Create SerialPort
var port = SerialPort;
port = null;
init();


/*
Telegram:
0x68
length(data)
length(data)
0x68
data
...
data
checksum
0x16
*/

const ByteHeader = 0x68;
const ByteAck = 0xe5;
const ByteEnd = 0x16;


var timeoutErrorAck;
var timeoutSerialPort;
var bytes = [];
var dataLenght = 0;
var counter = 0;
var error = false;
var lastRead;



function init(){
    port = new SerialPort({
        path: usbPath,
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "even",
        autoOpen: false
    })  

    //Search USB port by serial 
    SerialPort.list().then(function(ports){
        if (bySerial){
            ports.forEach(function(port){
                console.log(port);
                if (port.serialNumber === usbSerial){
                    usbPath = port.path;
                    console.log(usbPath);
                }
            });
            port.settings.path = usbPath;
        }
        port.open(function (err) {
            if (err) {
                console.log('Error opening port: ');
                return console.log(err.message);
            }else{
                console.log('Open port succsess: ' + usbPath);
            }
        })
    });

    // Switches the port into "flowing mode"
    port.on('data', function (data) {
        lastRead = Date.now();
        //Get bytes
        for (const value of data.values()) {
            if (error){break};
            //Header
            if (counter === 0 || counter === 3){ 
                if (value === ByteHeader) {
                    counter++
                } else {
                    console.log('error header byte');
                    error = true; 
                };
            }
            //Length
            else if (counter === 1 || counter === 2){ 
                dataLenght = value;
                counter++;
            } 
            //Data
            else if (counter >= 4 && counter <= dataLenght + 3){
                bytes.push(value);
                counter++;
            } 
            //Checksum
            else if (counter === (dataLenght + 4)){
                var checksum = 0;
                for (let i = 0; i < bytes.length; i++) {
                    checksum += bytes[i]
                }
                checksum = checksum & 0xFF;
                if (checksum != value){
                    console.log('error checksum');
                    error = true;
                }
                counter++;
            }
            //End
            else if (counter === (dataLenght + 5)){ 
                if (value === ByteEnd) {
                    //Get Data
                    getData(bytes,key_128,path);
                    //Ack
                    ack();
                    //Timeout
                    resetSerialPortTimeout();
                } else {
                    console.log('error end byte');
                    error = true; 
                };
            }
        }

        if (error){
            timeoutErrorAck = setTimeout(async function () {
                if (Date.now() - lastRead > 99){
                    //Ack
                    ack();
                }
            }, 100);
        }
    })
}


// close connection if script stopped
onStop(function (callback) {
    port.close(function (err) {
        console.log('port closed', err);
    })
}, 500 /*ms*/);


function ack(){
    //Ack
    const ack = Buffer.from([ByteAck]);
    port.write(ack);
    //Reset
    bytes = [];
    dataLenght = 0;
    counter = 0;
    error = false;
}

function resetSerialPortTimeout(){
    clearTimeout(timeoutSerialPort);
    timeoutSerialPort = setTimeout(async function () {
        console.log('No valid data, restart serial port');
        //ClosePort
        port.close(function (err) {
            console.log('port closed', err);
            //Creat new SerialPort
            port = null;
            init();
        })
    }, 240000);
}

//###############################################################################################
function getData(data,key,path){
    var key = aesjs.utils.hex.toBytes(key);

    var c = data.shift();
    var a = data.shift();
    var ci = data.shift();
    var identification = [data.shift(),data.shift(),data.shift(),data.shift()];
    var manufacturer = [data.shift(),data.shift()];
    var version = data.shift();
    var devType = data.shift();
    var access = data.shift();
    var status = data.shift();
    var configuration = [data.shift(),data.shift()];

    // The initialization vector (must be 16 bytes)
    var iv = [];
    iv.push(manufacturer[0]);
    iv.push(manufacturer[1]);
    for (let i = 0; i < 4; i++) {
        iv.push(identification[i]);
    }
    iv.push(version);
    iv.push(devType);
    for (let i = 0; i < 8; i++) {
        iv.push(access);
    }
    //console.log(data);
    //console.log(key);
    //console.log(iv);

    // The cipher-block chaining mode of operation maintains internal
    // state, so to decrypt a new instance must be instantiated.
    var aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);

    var decryptedBytes = aesCbc.decrypt(data);

    var seconds = decryptedBytes[4] & 0x3F;
    var minutes = decryptedBytes[5] & 0x3F;
    var hours = decryptedBytes[6] & 0x1F;
    var day = decryptedBytes[7] & 0x1F;
    var month = decryptedBytes[8] & 0x0F;
    var year = 2000 + ((decryptedBytes[8] & 0xF0) >> 1 | (decryptedBytes[7] & 0xE0) >> 5);

    var P_1_8_0   = getInt32(decryptedBytes,12);
    var P_2_8_0   = getInt32(decryptedBytes,19);
    var P_3_8_1   = getInt32(decryptedBytes,28);
    var P_4_8_1   = getInt32(decryptedBytes,38);
    var P_1_7_0   = getInt32(decryptedBytes,44);
    var P_2_7_0   = getInt32(decryptedBytes,51);
    var P_3_7_0   = getInt32(decryptedBytes,58);
    var P_4_7_0   = getInt32(decryptedBytes,66);
    var P_1_128_0 = getInt32(decryptedBytes,74);

    var utc = new Date(year, month, day, 
                    hours, minutes, seconds);
    
    
    //console.log(utc.getTime());
    /*
    console.log(seconds);
    console.log(minutes);
    console.log(hours);
    console.log(day);
    console.log(month);
    console.log(year);
    */
    /*
    console.log(P_1_8_0);
    console.log(P_2_8_0);
    console.log(P_3_8_1);
    console.log(P_4_8_1);
    console.log(P_1_7_0);
    console.log(P_2_7_0);
    console.log(P_3_7_0);
    console.log(P_4_7_0);
    console.log(P_1_128_0); 
    */

    setState(path + '.utc',Number(utc.getTime()));
    setState(path + '.1_8_0',Number(P_1_8_0));
    setState(path + '.2_8_0',Number(P_2_8_0));
    setState(path + '.3_8_1',Number(P_3_8_1));
    setState(path + '.4_8_1',Number(P_4_8_1));
    setState(path + '.1_7_0',Number(P_1_7_0)); 
    setState(path + '.2_7_0',Number(P_2_7_0));
    setState(path + '.3_7_0',Number(P_3_7_0));
    setState(path + '.4_7_0',Number(P_4_7_0));
    setState(path + '.1_128_0',Number(P_1_128_0));
    setState(path + '.saldo',Number(P_1_7_0 - P_2_7_0));
    setState(path + '.utclocal',Number(Date.now()));

}


//###############################################################################################
function getInt32(array,offset){
    var value = 0;
    for (var i = 3; i >= 0; i--) {
        value = (value << 8) | array[offset + i];
    }
    return value;
}



//###############################################################################################
//Create all States
function createStates(id){
    //create states
    createState(id + '.utc', 0, {
        type: 'number',
        role: 'state',
        name: 'utc',
        unit: 'ms'
    });
    createState(id + '.utclocal', 0, {
        type: 'number',
        role: 'state',
        name: 'utc locale',
        unit: 'ms'
    });
    createState(id + '.1_8_0', 0, {
        type: 'number',
        role: 'state',
        name: '1.8.0 Wirk Bezug Wh',
        unit: 'Wh'
    });
    createState(id + '.2_8_0', 0, {
        type: 'number',
        role: 'state',
        name: '2.8.0 Wirk Einspeis Wh',
        unit: 'Wh'        
    });
    createState(id + '.3_8_1', 0, {
        type: 'number',
        role: 'state',
        name: '3.8.1 Blind + varh',
        unit: 'varh'
    });
    createState(id + '.4_8_1', 0, {
        type: 'number',
        role: 'state',
        name: '4.8.1 Blind - varh',
        unit: 'varh'
    });
    createState(id + '.1_7_0', 0, {
        type: 'number',
        role: 'state',
        name: '1.7.0 Wirkleistung Bezug W',
        unit: 'W'
    });
    createState(id + '.2_7_0', 0, {
        type: 'number',
        role: 'state',
        name: '2.7.0 Wirkleistung Einspeis W',
        unit: 'W'
    });
    createState(id + '.3_7_0', 0, {
        type: 'number',
        role: 'state',
        name: '3.7.0 Blindleistung + W',
        unit: 'W'
    });
    createState(id + '.4_7_0', 0, {
        type: 'number',
        role: 'state',
        name: '4.7.0 Blindleistung - W',
        unit: 'W'
    });
    createState(id + '.1_128_0', 0, {
        type: 'number',
        role: 'state',
        name: '1.128.0 Inkassozählwerk Wh',
        unit: 'Wh'
    });
    createState(id + '.saldo', 0, {
        type: 'number',
        role: 'state',
        name: 'Saldo W',
        unit: 'W'
    });
    
};


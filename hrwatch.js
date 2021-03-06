const HRW_HRMONITOR_ADDR = CHANGE_ME;
const HRW_AGE = CHANGE_ME;
const HRW_ALERT_THRESHOLD = CHANGE_ME;
const HRW_PASSWORD = CHANGE_ME;

E.setPassword(HRW_PASSWORD);
E.lockConsole();

E.enableWatchdog(3, false);

var gatt;
var adv_enabled = true;

// OLED driver taken from https://gist.github.com/fanoush/ce461c73c299834bcb53a615721b5a2e
Modules.addCached("DSD6OLED",function(){
//modified SSD1306, 128x32 but needs 0xda,0x12
// commands sent when initialising the display
var initCmds = new Uint8Array([
0xAe, // 0 disp off
0xD5, // 1 clk div
0x80, // 2 suggested ratio
0xA8, 31, // 3 set multiplex, height-1
0xD3,0x0, // 5 display offset
0x40, // 7 start line
0x8D, 0x14, // 8 charge pump
0x20,0x0, // 10 memory mode - horizontal
0xA1, // 12 seg remap 1
0xC0, // 13 comscandec
0xDA, 0x12, // 14 set compins, height==64 ? 0x12:0x02,
0x81, 0xCF, // 16 set contrast
0xD9, 0xF1, // 18 set precharge
0xDb, 0x40, // 20 set vcom detect
0xA4, // 22 display all on
0xA6, // 23 display normal (non-inverted)
0xAf // 24 disp on
]);

// commands sent when sending data to the display
var flipCmds = new Uint8Array([
0x21, // columns
0, 127, // OLED_WIDTH-1
0x22, // pages
0, 3 /* (height>>3)-1 */
]);

var rotCmds = Uint8Array([
0x20,0x0, // 10 memory mode - horizontal
0xA1, // 12 seg remap 1
0xC0, // 13 comscandec
]);

var rot;
var gfxV;
var gfxH;

exports.connectSPI = function(spi, dc,  rst, callback, options) {
  if (rst) rst.reset();
  var cs = options?options.cs:undefined;
  var r = options&&options.rotation?options.rotation:90;
  if (options && options.contrast>=0) initCmds[17] = options.contrast;
  var oled = {};
  gfxV=Graphics.createArrayBuffer(32,128,1,{vertical_byte : false});
  gfxH=Graphics.createArrayBuffer(128,32,1,{vertical_byte : true});
  oled.isOn=false;
  oled.isInverted=false;
  oled.init = function(cmdArray){
    if (cs) cs.reset();
    // configure the OLED
    digitalWrite(dc,0); // command
    spi.write(cmdArray);
    digitalWrite(dc,1); // data
    if (cs) cs.set();
  };

  oled.setRotation = function(r){
    if (r === 0){rotCmds[1]=1;rotCmds[2]=0xa1;rotCmds[3]=0xc8;}
    if (r === 180){rotCmds[1]=1;rotCmds[2]=0xa0;rotCmds[3]=0xc0;}
    if (r === 90){rotCmds[1]=0;rotCmds[2]=0xa1;rotCmds[3]=0xc0;}
    if (r === 270){rotCmds[1]=0;rotCmds[2]=0xa0;rotCmds[3]=0xc8;}
    oled.gfx=(r%180===0)?gfxV:gfxH;
    rot=r;
    oled.init(rotCmds);
  };

  if (rst) digitalPulse(rst,0,20);
  setTimeout(function() {
    oled.init(initCmds);
    oled.setRotation(r);
    oled.isOn=true;
    // if there is a callback, call it now(ish)
    if (callback !== undefined) setTimeout(callback, 10);
  }, 50);

  // write to the screen
  oled.flip = function() {
    // set how the data is to be sent (whole screen)
    if (cs) cs.reset();
    digitalWrite(dc,0);// command
    spi.write(flipCmds);
    digitalWrite(dc,1);// data
    spi.write(((rot%180===0)?gfxV:gfxH).buffer);
    if (cs) cs.set();
  };

  // set contrast, 0..255
  oled.setContrast = function(c) {
    if (cs) cs.reset();
    spi.write(0x81,c,dc);
    if (cs) cs.set();
  };

  // set off
  oled.off = function() {
    if (cs) cs.reset();
    spi.write(0xAE,dc);
    if (cs) cs.set();
    oled.isOn=false;
  };

  // set on
  oled.on = function() {
    if (cs) cs.reset();
    spi.write(0xAF,dc);
    if (cs) cs.set();
    oled.isOn=true;
  };

  // invert screen
  oled.invert = function(enable) {
    if (enable === undefined) enable = !oled.isInverted;
    if (cs) cs.reset();
    spi.write(enable ? 0xA7 : 0xA6,dc);
    if (cs) cs.set();
    oled.isInverted=!!enable;
  };

  // return graphics
  return oled;
};
});

Modules.addCached("DSD6",function(){

// D3 pin is battery voltage
// D2 pin is analog charger voltage
// with known 5V input  5.0/analogRead(D2) gave me 6.61207596594
// feel free to recalibrate yourself
exports.battVoltage=function(){
  var v=6.61207596594*analogRead(D3);
  //poke32(0x5000070c,2); // disconnect pin for power saving, otherwise it draws 70uA more
  return v;
};
exports.chargerVoltage=function(){
  var v=6.61207596594*analogRead(D2);
  //poke32(0x5000070c,2); // disconnect pin for power saving, otherwise it draws 70uA more
  return v;
};
exports.isCharging=function(){
  return !!digitalRead(D2);
};
exports.DFUmode=function(){
  NRF.wake();
  poke32(0x4000051c,1);
};
exports.deviceName=function(){
  // extract the local device name from the advertising data
  const adv = NRF.getAdvertisingData();
  if(adv.length > 0) {
    const start = 1 + adv[0];
    if(start < adv.length) {
      const len = adv[start];
      // 0x08 is for "Shortened local name"
      // 0x09 is for "Complete local name"
      if(len > 2 && len == adv.length - start - 1 &&
         (adv[start + 1] == 0x08 || adv[start + 1] == 0x09)) {
        return String.fromCharCode.apply(this, adv).substr(start + 2);
      }
    }
  }
  return undefined;
};
function vibon(vib){
 if(vib.i>=1)D25.set();else analogWrite(D25,vib.i);
 setTimeout(viboff,vib.on,vib);
}
function viboff(vib){
 D25.reset();
 if (vib.c>1){vib.c=vib.c-1;setTimeout(vibon,vib.off,vib);}
}
exports.vibrate=function(intensity,count,onms,offms){
 vibon({i:intensity,c:count,on:onms,off:offms});
};

exports.initOLED=function(rot,f){
require("FontDennis8").add(Graphics);
require("Font8x16").add(Graphics);
var spi=SPI1; //new SPI()
spi.setup({mosi:D6,sck:D5,baud:8000000});

if (f===undefined) f=function(){
 o.gfx.setFontDennis8();
 o.gfx.drawString("Espruino on DS-D6",20,12);
 o.flip();
 setTimeout(() => {o.off();}, 3000);
};
if(rot===undefined) rot=270;
var o=require("DSD6OLED").connectSPI(spi,D28,D4,f,{cs:D29,rotation:rot});
exports.OLED=o;
};
});

var w=require("DSD6");
w.initOLED(270); // init and set to landscape mode
var o=w.OLED;

function setupSerial(s){
  if (!s) s = Serial1;
  s.setup(38400, {rx:D22,tx:D23});
}
function resumeConsole(s){
  setupSerial(s);
  setTimeout(() => {s.setConsole();}, 50);
}
function pauseConsole(s){
  if (!s) s=Serial1;
  if(s._options){
    Bluetooth.setConsole(1);
    setTimeout(() => {
      var rx = s._options.rx;
      s.unsetup();
      rx.mode("input_pulldown");
      setWatch(()=>{resumeConsole(s);},rx,{edge:'rising',debounce:30});}, 500);
  }
}

var model = {
  startDate: undefined,
  endDate: undefined,
  bpm: undefined,
  bpmPc: undefined,
  alertStart: undefined,
  alertDur: 0.0,
  alertInstDur: 0.0,
  // The 1st and 2nd array elts are reserved to store current index and count
  rrArray: new Uint16Array(2 + 1500),
  // store (RRI prec - RRI) to precompute RMSSD for short durations
  rrDiff: new Int16Array(1500),
  // store for each HR zone (8):
  // sum of RRI values, rmssd precalculation, count of total RR intervals
  // mean, variance precalculation, skewness precalculation, kurtosis precalculation, min, max
  rrTotal: new Float64Array(9 * 8),
  // for mode and stress index calculations
  rrCounts: new Uint24Array(1 + 1200),
  rrBins: new Uint24Array(1 + 24),
  // reserved for RRI filtering
  rrBuffer: new Uint16Array(5 + 50),

  computeDuration: function(start, end) {
    if(start === undefined) {
      start = this.startDate;
    }
    if(start === undefined) {
      return undefined;
    }

    if(end === undefined) {
      end = this.endDate;
    }
    if(end === undefined) {
      end = Date.now();
    }
    return (end - start);
  },

  computeDurationPc: function(dur, zone) {
    const totalZone = model.computeTotalRRI(zone);
    if(totalZone === undefined) {
      return undefined;
    }
    return 100.0 * ((totalZone / 1.024) / dur);
  },

  durationToString: function(start, end, showMs) {
    let dd = this.computeDuration(start, end);
    if(dd === undefined) {
      return "";
    }

    let dur = "";
    dd /= 1000; // in seconds
    if(dd < 0) {
      dur += "-";
      dd = -dd;	
    }
    let h = ~~(dd / 3600);
    if(h <= 9) {
      h = "0" + h;
    }
    dur += h + ":";
    let m = ~~((dd % 3600) / 60);
    if(m <= 9) {
      m = "0" + m;
    }
    dur += m + ":";
    let s = ~~(dd % 60);
    if(s <= 9) {
      s = "0" + s;
    }
    dur += s;
    if(showMs) {
      const ms = (dd % 1000) + 1000;
      dur += "." + ms.toFixed(0).substr(1);
    }

    return dur;
  },

  hrToString: function(hr, nbDigits, pcNbDigits, hrPc) {
    if(isNaN(hr)) {
      return "N/A";
    }
    if(nbDigits === undefined) {
      nbDigits = 1;
    }
    if(pcNbDigits === undefined) {
      pcNbDigits = 1;
    }
    if(hrPc === undefined) {
      hrPc = model.computeBpmPc(hr);
    }
    return (hr.toFixed(nbDigits).toString() + " " + hrPc.toFixed(pcNbDigits).toString()+ "%");
  },

  nbToString: function(nb, nbDigits, total, pcNbDigits) {
    if(isNaN(nb)) {
      return "N/A";
    }
    if(nbDigits === undefined) {
      nbDigits = 1;
    }
    let res = nb.toFixed(nbDigits).toString();
    if(total !== undefined) {
      if(pcNbDigits === undefined) {
        pcNbDigits = 1;
      }
      res += " " + (100.0 * (nb / total)).toFixed(pcNbDigits).toString() + "%";
    }
    return res;
  },

  mayAlert: function(newBpmPc) {
    if(HRW_ALERT_THRESHOLD === undefined) {
      return;
    }

    if(newBpmPc === undefined) {
      this.handleError();
      return;
    }

    if(newBpmPc >= HRW_ALERT_THRESHOLD) {
      const now = Date.now();
      // inside alert zone?
      if(this.bpmPc !== undefined && this.bpmPc >= HRW_ALERT_THRESHOLD) {
        if(this.alertStart !== undefined) {
          this.alertDur += now - this.alertStart;
        }
      }
      // entered alert zone?
      else {
        o.invert(true);
        w.vibrate(100, 1, 1000, 0);
      }

      this.alertStart = now;
    }
    // left alert zone?
    else if(this.bpmPc !== undefined && this.bpmPc >= HRW_ALERT_THRESHOLD) {
      o.invert(false);
      if(this.alertStart !== undefined) {
        this.alertDur += Date.now() - this.alertStart;
        this.alertStart = undefined;
      }
    }
  },

  update: function(value) {
    // adapted from https://stackoverflow.com/a/52935617
    let offset = 1;
    if ((value.getUint8(0) & 0x01) === 0) {
        this.bpm = value.getUint8(1);
        offset = offset + 1; // plus 1 byte
    }
    else {
        let bpm = value.getUint16(1);
        this.bpm = (bpm >> 8) | ((bpm << 8) & 0xffff);
        offset =  offset + 2; // plus 2 bytes
    }
    let bpmPc = this.computeBpmPc(this.bpm);
    this.mayAlert(bpmPc);
    this.bpmPc = bpmPc;

    // determine if RR interval data are present
    if ((value.getUint8(0) & (1 << 4)) !== 0)
    {
      const length = value.byteLength;
      const count = (length - offset) >> 1;
      for(let idx = 0; idx < count; idx++) {
        let rri = value.getUint16(offset + (idx * 2));
        rri = (rri >> 8) | ((rri << 8) & 0xffff);
        this.addRRI(rri);
      }
    }
  },

  precomputeRRIStats: function(rri, zone, diff2) {
    if(zone === undefined) {
        zone = 7;
    }
    const idx = 9 * zone;
    this.rrTotal[idx] += rri;
    if(diff2 !== undefined) {
      this.rrTotal[idx + 1] += diff2;
    }
    // adapted from https://www.johndcook.com/blog/skewness_kurtosis/
    const n = ++this.rrTotal[idx + 2];
    const delta = rri - this.rrTotal[idx + 3];
    const delta_n = delta / n;
    const delta_n2 = Math.pow(delta_n, 2);
    const term1 = delta * delta_n * (n - 1);
    // update moments precomputations
    this.rrTotal[idx + 3] += delta_n;
    const M2 = this.rrTotal[idx + 4];
    const M3 = this.rrTotal[idx + 5];
    this.rrTotal[idx + 6] += term1 * delta_n2 * (n*n - 3*n + 3) + 6 * delta_n2 * M2 - 4 * delta_n * M3;
    this.rrTotal[idx + 5] += term1 * delta_n * (n - 2) - 3 * delta_n * M2;
    this.rrTotal[idx + 4] += term1;
    // update min
    const minRRI = this.rrTotal[idx + 7];
    if(!minRRI || rri < minRRI) {
      this.rrTotal[idx + 7] = rri;
    }
    // update max
    const maxRRI = this.rrTotal[idx + 8];
    if(maxRRI < rri) {
      this.rrTotal[idx + 8] = rri;
    }
  },

  updateRRICounts: function(rri) {
    rri = ~~(rri / 1.024) - 300;
    // keep counts for the RRIs between 300 and 1200 ms
    if(rri < 0 || rri >= 1200) {
      return;
    }

    // update current mode
    let maxIdx = this.rrCounts[0];
    let rrIdx = 1 + rri;  
    let count = ++this.rrCounts[rrIdx];
    if(maxIdx == 0 ||
       (maxIdx !== rrIdx && this.rrCounts[maxIdx] < count)) {
      this.rrCounts[0] = rrIdx;
    }

    // update mode bin (50 ms width)
    rri = ~~(rri / 50);
    maxIdx = this.rrBins[0];
    rrIdx = 1 + rri;  
    count = ++this.rrBins[rrIdx];
    if(maxIdx == 0 ||
       (maxIdx !== rrIdx && this.rrBins[maxIdx] < count)) {
      this.rrBins[0] = rrIdx;
    }
    
  },

  addRRI: function(rri) {
    if(HRW_ALERT_THRESHOLD !== undefined) {
      const pc = this.computeBpmPc(this.computeBpm(rri));
      if(pc >= HRW_ALERT_THRESHOLD) {
        this.alertInstDur += rri;
      }
    }

    const zone = this.computeBpmZone(this.computeBpm(rri));
    if(this.rrArray[1] !== 0) {
      const diff = rri - this.rrArray[2 + this.rrArray[0]];
      const diff2 = Math.pow(diff, 2);
      this.precomputeRRIStats(rri, zone, diff2);
      this.precomputeRRIStats(rri, undefined, diff2);
      this.rrDiff[this.rrArray[0]] = diff;
      this.rrArray[0] = (this.rrArray[0] + 1) % (this.rrArray.length - 2);
    }
    else {
        this.precomputeRRIStats(rri, zone);
        this.precomputeRRIStats(rri, undefined);
    }
    if(this.rrArray[1] < this.rrArray.length - 2) {
      this.rrArray[1]++;
    }
    this.rrArray[2 + this.rrArray[0]] = rri;
    this.updateRRICounts(rri);
  },

  rrLength: function() {
    return this.rrArray[1];
  },

  empty: function() {
    return (this.rrLength() === 0 && this.startDate === undefined);
  },

  reset: function() {
    this.startDate = undefined;
    this.endDate = undefined;
    this.bpm = undefined;
    this.bpmPc = undefined;
    this.alertStart = undefined;
    this.alertDur = 0.0;
    this.alertInstDur = 0.0;
    this.rrArray.fill(0);
    this.rrDiff.fill(0);
    this.rrTotal.fill(0);
    this.rrCounts.fill(0);
  },

  computeTotalRRI: function(zone, index) {
    if(index === undefined) {
      index = 0;
    }
    if(zone === undefined) {
      zone = 7;
    }

    return this.rrTotal[(9 * zone) + index];
  },

  computeTotalRRICount: function(zone) {
    return this.computeTotalRRI(zone, 2);
  },

  // Bessel-corrected RMSSD in ms (not in 1/1024 format)
  computeTotalRMSSD: function(zone) {
    const count = this.computeTotalRRICount(zone);
    if(count < 2) {
      return undefined;
    }

    return Math.sqrt(this.computeTotalRRI(zone, 1) / (count - 1)) / 1.024;
  },

  // mean RRI in 1/1024 format
  computeTotalAvgRRI: function(zone) {
    return this.computeTotalRRI(zone, 3);
  },

  // Bessel-corrected variance in ms^2 (not in 1/1024 format)
  computeTotalRRIVariance: function(zone) {
    const count = this.computeTotalRRICount(zone);
    if(count < 1) {
      return undefined;
    }

      return this.computeTotalRRI(zone, 4) / ((count - 1) * Math.pow(1.024, 2));
  },

  // Bessel-corrected standard deviation in ms (not in 1/1024 format)
  computeTotalSDNN: function(zone) {
    const count = this.computeTotalRRICount(zone);
    if(count < 1) {
      return undefined;
    }

    return Math.sqrt(this.computeTotalRRIVariance(zone));
  },

  // RRI skewness (no unit)
  computeTotalRRISkewness: function(zone) {
    const count = this.computeTotalRRICount(zone);
    if(count < 1) {
      return undefined;
    }

    const M2 = this.computeTotalRRI(zone, 4);
    const M3 = this.computeTotalRRI(zone, 5);
    return Math.sqrt(count) * M3 / Math.pow(M2, 1.5);
  },

  // RRI kurtosis (no unit)
  computeTotalRRIKurtosis: function(zone) {
    const count = this.computeTotalRRICount(zone);
    if(count < 1) {
      return undefined;
    }

    const M2 = this.computeTotalRRI(zone, 4);
    const M4 = this.computeTotalRRI(zone, 6);
    return count * M4 / Math.pow(M2, 2) - 3.0;
  },
  
  // min RRI in 1/1024 format
  computeTotalRRIMin: function(zone) {
    return this.computeTotalRRI(zone, 7);
  },

  // max RRI in 1/1024 format
  computeTotalRRIMax: function(zone) {
    return this.computeTotalRRI(zone, 8);
  },

  // mode in ms
  computeRRIMode: function() {
    const idx = this.rrCounts[0];
    if(!idx) {
      return undefined;
    }

    return 300 + idx - 1;
  },

  computeRRIModeCount: function() {
    const idx = this.rrCounts[0];
    if(!idx) {
      return undefined;
    }

    return this.rrCounts[idx];
  },

  computeRRIModeAmplitude: function() {
    const idx = this.rrBins[0];
    if(!idx) {
      return undefined;
    }

    return this.rrBins[idx] / this.computeTotalRRICount();
  },
  
  handleError: function() {
    this.alertStart = undefined;
  },

  computeMaxHR: function(age) {
    return (220 - age);
  },

  computeBpm: function(srri, count) {
    if(!srri) {
      return undefined;	  
    }
	
    if(count === undefined) {
      count = 1;
    }

    return (60.0 * 1024.0 * count) / srri;
  },

  computeBpmPc: function(bpm) {
    return 100.0 * (bpm / this.computeMaxHR(HRW_AGE));
  },

  // 8 zones : 0 (< 50%), 1 (50%-60%), 2 (60%-70%), 3 (70%-80%)
  //           4 (80%-90%), 5 (90%-100%), 6 (>= 100%), 7 (total of all zones)
  computeBpmZone: function(bpm) {
    const pc = this.computeBpmPc(bpm);
    if(pc < 50.0) {
      return 0;
    }
    if(pc >= 100.0) {
      return 6;
    }

    return ~~((pc - 40) / 10);
  },

  // compute HR (bpm) for "count" RR intervals.
  computeHR: function(count) {
    const srri = this.sumRRI(count);
    if(srri === undefined) {
      return undefined;
    }

    return this.computeBpm(srri, count);
  },

  // compute instantaneous heart rate
  computeIHR: function() {
    return this.computeHR(1);
  },

  computeAvgHR: function(zone) {
    return this.computeBpm(this.computeTotalAvgRRI(zone));
  },

  sumRRI: function(count) {
    const length = this.rrArray[1];
    if(length === 0) {
      return undefined;
    }
    if(count === undefined || count <= 0 || count > length) {
      return undefined;
    }

    const idx = this.rrArray[0];
    const res = idx - (count - 1);
    const tmp = new Uint16Array(this.rrArray.buffer, (res < 0) ? 4 : (2 + res) * 2, (res < 0) ? count + res : count);
    let srri = E.sum(tmp);
    if(res < 0) {
      const tmp2 = new Uint16Array(this.rrArray.buffer, (2 + length + res) * 2, -res);
      srri += E.sum(tmp2);
    }

    return srri;
  },

  // keep the "slow" way to sum RR intervals
  // so we can compare the fast and slow outputs
  sumRRISlow: function(count) {
    const length = this.rrArray[1];
    if(length === 0) {
      return undefined;
    }
    if(count === undefined || count <= 0 || count > length) {
      return undefined;
    }

    let srri = 0.0;
    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      srri += this.rrArray[2 + locidx];
    }

    return srri;
  },

  // Bessel-corrected RMSSD for "count" RRIs in ms (not in 1/1024 format)
  computeRMSSD: function(count) {
    const length = this.rrArray[1];
    if(length < 2) {
      return undefined;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    count -= 1;
    if(count <= 0) {
      return undefined;
    }

    let rmssd = 0.0;
    // diff between previous and current rris is stored in rrDiff[idx - 1]
    const idx = (length + this.rrArray[0] - 1) % length;
    const res = idx - (count - 1);
    const tmp = new Int16Array(this.rrDiff.buffer, (res < 0) ? 0 : res * 2, (res < 0) ? count + res : count);
    rmssd = E.variance(tmp, 0);
    if(res < 0) {
      const tmp2 = new Int16Array(this.rrDiff.buffer, (length + res) * 2, -res);
      rmssd += E.variance(tmp2, 0);	  
    }
      
    rmssd = Math.sqrt(rmssd / count) / 1.024;
    return rmssd;
  },

  // keep the "slow" way to compute RMSSD
  // so we can compare the fast and slow outputs
  computeRMSSDSlow: function(count) {
    const length = this.rrArray[1];
    if(length < 2) {
      return undefined;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    let rmssd = 0.0;
    let locidx = this.rrArray[0];
    let locval = this.rrArray[2 + locidx];  
    for(let idx = 0; idx < count - 1; idx++) {
      const previdx = (length + locidx - 1) % length;
      const prevval = this.rrArray[2 + previdx];
      rmssd += Math.pow((locval - prevval) / 1.024, 2);
      locidx = previdx;
      locval = prevval;
    }

    rmssd = Math.sqrt(rmssd / (count - 1));
    return rmssd;
  }, 

  // Bessel-corrected standard deviation for "count" RRIs in ms (not in 1/1024 format)
  computeSDNN: function(count) {
    const length = this.rrArray[1];
    if(length < 2) {
      return undefined;
    }
    if(count === undefined || count > length) {
      count = length;
    }
    if(count <= 0) {
      return undefined;
    }

    let sdnn = 0.0;
    const idx = this.rrArray[0];
    const res = idx - (count - 1);
    const tmp = new Uint16Array(this.rrArray.buffer, (res < 0) ? 4 : (2 + res) * 2, (res < 0) ? count + res : count);
    let avg = E.sum(tmp);
    if(res < 0) {
      const tmp2 = new Uint16Array(this.rrArray.buffer, (2 + length + res) * 2, -res);
      avg += E.sum(tmp2);
      avg /= count;
      sdnn = E.variance(tmp, avg) + E.variance(tmp2, avg);	  
    }
    else {
      avg /= count;
      sdnn = E.variance(tmp, avg);
    }
      
    sdnn = Math.sqrt(sdnn / (count - 1)) / 1.024;
    return sdnn;
  },

  // keep the "slow" way to compute SDNN
  // so we can compare the fast and slow outputs
  computeSDNNSlow: function(count) {
    const length = this.rrArray[1];
    if(length < 2) {
      return undefined;
    }
    if(count === undefined || count > length) {
      count = length;
    }

    let sdnn = 0.0;
    let avg = 0.0;
    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      avg += this.rrArray[2 + locidx];
    }

    avg /= count;

    for(let idx = 0; idx < count; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      sdnn += Math.pow((this.rrArray[2 + locidx] - avg) / 1.024, 2);
    }

    sdnn = Math.sqrt(sdnn / (count - 1));
    return sdnn;
  },

  // compute Baevsky's stress index (no unit)
  computeStressIndex: function() {
    const amo = 100.0 * this.computeRRIModeAmplitude();
    const mo = this.computeRRIMode() / 1000.0;
    const mxdmn = (this.computeTotalRRIMax() - this.computeTotalRRIMin()) / 1024.0;
    return amo / (2 * mo * mxdmn);
  },

  // how many RR intervals for a duration of "dur" seconds?
  countRRI: function(dur) {
    const length = this.rrArray[1];
    if(length === 0) {
      return undefined;
    }

    const curIdx = this.rrArray[0];
    dur *= 1024.0;
    let srri = E.sum(this.rrArray) - length - curIdx;
    if(srri < dur) {
      return undefined;
    }
    if(srri === dur) {
      return length;
    }

    // as E.sum() is fast but manual looping is slow,
    // do a binary search to have the minimal number of loops
    let low = 1;
    let high = length;      
    let found = false;
    let count = undefined;
    while(low <= high) {
      let middle = (low + high) >> 1;
      srri = this.sumRRI(middle);
      if(srri === dur) {
        found = true;
        count = middle;
        break;
      }
      if(srri < dur) {
        if(middle < length) {
          const locidx = (length + curIdx - middle) % length;
          const rri = this.rrArray[2 + locidx];
          if(srri + rri > dur) {
            found = true;
            count = middle + ((dur - srri) / rri);
            break;
          }
        }

        low = middle + 1;
      }
      else {
        high = middle - 1;
      }
    }
      
    if(!found) {
      return undefined;
    }

    return count;
  },

  // keep the "slow" way to compute RRI count
  // so we can compare the fast and slow outputs
  countRRISlow: function(dur) {
    const length = this.rrArray[1];
    if(length === 0) {
      return undefined;
    }

    dur *= 1024.0;
    let found = false;
    let count = 0;
    let srri = 0.0;
    for(let idx = 0; idx < length; idx++) {
      const locidx = (length + this.rrArray[0] - idx) % length;
      const rri = this.rrArray[2 + locidx];
      srri += rri;
      if(srri >= dur) {
        found = true;
        count += ((dur - (srri - rri)) / rri);
        break;
      }
      count++;
    }

    if(!found) {
      return undefined;
    }

    return count;
  },
};

var gui = {
  panelIdx: -1,
  nextPanelIdx: 0,
  panelTimeout: undefined,
  timeoutId: -1,
  modelUpdateDur: undefined,
  panels: { 0x000: [function() {this.drawTitle("welcome");}, 0x001],
            0x001: [function() {this.drawTitle("start");}, 0x002, 0x100],
            0x002: [function() {this.drawTitle("view");}, 0x003, 0x200],
            0x003: [function() {this.drawTitle("revert adv");}, 0x004, 0x300],
            0x004: [function() {this.drawTitle("reboot");}, 0x005, 0x400],
            0x005: [function() {this.drawTitle("DFU mode");}, 0x006, 0x500],
            0x006: [function() {this.drawDeviceInfos();}, 0x007, 0x006],
            0x007: [function() {this.drawConfInfos();}, 0x008],
            0x008: [function() {this.drawMemInfos();}, 0x009, 0x008],
            0x009: [function() {this.drawTitle("off");}, 0x000, 0x900],
            0x100: [function() {connectToHRM(true);}, 0x101, 0x101, 1],
            0x101: [function() {this.drawHRPanel();}, 0x102],
            0x102: [function() {this.drawHRPanel();}, 0x103],
            0x103: [function() {this.drawHRPanel();}, 0x104],
            0x104: [function() {this.drawHRPanel();}, 0x105],
            0x105: [function() {this.drawHRPanel();}, 0x106],
            0x106: [function() {this.drawHRPanel();}, 0x107],
            0x107: [function() {this.drawHRPanel();}, 0x108],
            0x108: [function() {this.drawHRPanel();}, 0x109],
            0x109: [function() {this.drawHRPanel();}, 0x10a],
            0x10a: [function() {this.drawHRPanel();}, 0x10b],
            0x10b: [function() {this.drawHRPanel();}, 0x10c],
            0x10c: [function() {this.drawHRPanel();}, 0x10d],
            0x10d: [function() {this.drawHRPanel();}, 0x10e],
            0x10e: [function() {this.drawHRPanel();}, 0x10f],
            0x10f: [function() {this.drawHRPanel();}, 0x110],
      	    0x110: [function() {this.drawHRPanel();}, 0x111],
            0x111: [function() {this.drawHRPanel();}, 0x112],
            0x112: [function() {this.drawHRPanel();}, 0x1fe],
            0x1fe: [function() {this.drawTitle("exit");}, 0x101, 0x1ff],
            0x1ff: [function() {disconnectHRM();}, 0x000, 0x000, 1],
            0x200: [function() {this.viewHRData();}, 0x000],
            0x300: [function() {revertBT();}, 0x000, 0x000, 1],
            0x400: [function() {E.reboot();}, 0x000],
            0x500: [function() {w.DFUmode();}, 0x000],
            0x900: [function() {this.panelIdx = -1; o.off();}, 0x000],
  },

  nextPanel: function(idx1, idx2, timeout) {
    if(idx2 !== undefined) {
      if(timeout === undefined) {
        if(this.panelTimeout === undefined) {
          this.panelTimeout = 6;
        }
        else if(this.panelTimeout > 0) {
          this.panelTimeout--;
        }
        else {
          this.panelTimeout = undefined;
        }
      }

      if(this.panelTimeout !== undefined) {
        this.timeoutId = setTimeout(() => {this.updatePanel(); this.nextPanel(idx1, idx2, timeout);}, 1000);
      }
      else {
        if(timeout === undefined) {
          timeout = 1;
        }
        this.timeoutId = setTimeout(() => {this.nextPanelIdx = idx2; this.incPanel();}, timeout);
      }
    }
    this.nextPanelIdx = idx1;
  },

  drawHeader: function(duration, hr) {
    o.gfx.clear();
    o.gfx.setFontDennis8();
    if(this.panelTimeout !== undefined) {
      const end = (this.panelTimeout === 0) ? 0 : (this.panelTimeout - 1);
      duration = model.durationToString(0.0, end * 1000.0);
    }

    let header = "";
    if(w.isCharging()) {
      header += "\xa9";
    }
    const bv = w.battVoltage().toFixed(1).toString() + "V";
    header += bv;
    if(duration !== undefined) {
      header += " \x9a " + duration;
    }
    header += " \x9a ";
    if(hr !== undefined) {
      header += hr;
    }
    else {
      header += "Adv: " + (adv_enabled ? "on" : "off");
    }
    o.gfx.drawString(header, 0, 0);
    o.gfx.drawLine(0, 8, 128, 8);
  },

  drawBody: function(line1, line2, line3) {
    if(line3 !== undefined) {
      o.gfx.setFontDennis8();
      o.gfx.drawString(line1, 0, 9);
      o.gfx.drawString(line2, 0, 17);
      o.gfx.drawString(line3, 0, 25);
    }
    else if(line2 !== undefined) {
      o.gfx.setFont8x16();
      o.gfx.drawString(line1, 0, 9);
      o.gfx.drawString(line2, 0, 20);
    }
    else {
      o.gfx.setFontVector(20);
      o.gfx.drawString(line1, 0, 9);
    }	
  },

    drawTitle: function(title, line2, line3) {
    o.on();
    this.drawHeader();
    this.drawBody(title, line2, line3);
    o.flip();
  },

  drawDeviceInfos: function() {
    o.on();
    this.drawHeader();
    this.drawBody("Name: " + w.deviceName(),
                  "BT addr: " + NRF.getAddress(),
		              "Temp: " + model.nbToString(E.getTemperature(), 2).toString() + " °C");
    o.flip();
  },

  drawConfInfos: function() {
    o.on();
    this.drawHeader();
    const maxHr = model.computeMaxHR(HRW_AGE);
    let line2 = "Alert: " + model.nbToString(HRW_ALERT_THRESHOLD);
    if(HRW_ALERT_THRESHOLD !== undefined) {
      line2 += "% \x85 HR: " + model.nbToString((HRW_ALERT_THRESHOLD / 100) * maxHr);
    }
    this.drawBody("Age: " + HRW_AGE + " \x85 Max HR: " + model.nbToString(maxHr),
                  line2, "HRM addr: " + HRW_HRMONITOR_ADDR);
    o.flip();
  },

  drawMemInfos: function() {
    o.on();
    this.drawHeader();
    const mem = process.memory();
    this.drawBody("Used mem: " + model.nbToString(mem.usage, 0, mem.total),
                  "Free mem: " + model.nbToString(mem.free, 0, mem.total),
                  "Total mem: " + model.nbToString(mem.total, 0, mem.total));
    o.flip();
  },

  viewHRData: function() {
    if(model.empty()) {
      this.drawTitle("no data!");
      this.nextPanel(0x1fe);
    }
    else {
      this.nextPanel(0x101, 0x101, 1);
    }
  },
  
  drawHRPanel: function() {
    o.on();
    o.gfx.clear();
    let hhr = model.bpm;
    let hhrPc = model.bpmPc;
    if(this.panelIdx === 0x101) {
      hhr = model.computeAvgHR();
      hhrPc = model.computeBpmPc(hhr);
    }
    let dur = model.computeDuration();
    this.drawHeader(model.durationToString(0, dur), "\x80 " + model.hrToString(hhr, 0, 0, hhrPc));
    switch(this.panelIdx) {
      case 0x101:
        this.drawBody(model.hrToString(model.bpm, 0, 1, model.bpmPc));
        break;
      case 0x102: {
        const ihr = model.computeIHR();
        const ahr = model.computeAvgHR();
        this.drawBody("IHR: " + model.hrToString(ihr),
                      "HR AVG: " + model.hrToString(ahr)); }
        break;
      case 0x103: {
        const hr10 = 6.0 * model.countRRI(10);
        const hr60 = model.countRRI(60);
        this.drawBody("HR 10s: " + model.hrToString(hr10),
                      "HR 60s: " + model.hrToString(hr60)); }
        break;
      case 0x104: {
        let rmssd5m = undefined;
        const nbRR = model.countRRI(300);
        if(nbRR !== undefined) {
          rmssd5m = model.computeRMSSD(Math.round(nbRR));
        }
        this.drawBody("RMSSD 5m: " + model.nbToString(rmssd5m) + " ms",
                      "ln(RMSSD): " + model.nbToString(Math.log(rmssd5m))); }
        break;
      case 0x105: {
        const rmssd = model.computeTotalRMSSD();
        this.drawBody("RMSSD all: " + model.nbToString(rmssd) + " ms",
                      "ln(RMSSD): " + model.nbToString(Math.log(rmssd))); }
        break;
      case 0x106: {
        let sdnn5m = undefined;
        const nbRR = model.countRRI(300);
        if(nbRR !== undefined) {
          sdnn5m = model.computeSDNN(Math.round(nbRR));
        }
        this.drawBody("SDNN 5m: " + model.nbToString(sdnn5m) + " ms",
                      "ln(SDNN): " + model.nbToString(Math.log(sdnn5m))); }
        break;
      case 0x107: {
        const sdnn = model.computeTotalSDNN();
        this.drawBody("SDNN all: " + model.nbToString(sdnn) + " ms",
                      "ln(SDNN): " + model.nbToString(Math.log(sdnn))); }
        break;
      case 0x108: {
        this.drawBody("  < 50%: " + model.durationToString(0, model.computeTotalRRI(0) / 1.024, true),
                      "50\x8560%: " + model.durationToString(0, model.computeTotalRRI(1) / 1.024, true),
                      "60\x8570%: " + model.durationToString(0, model.computeTotalRRI(2) / 1.024, true)); }
        break;
      case 0x109: {
        this.drawBody(("  < 50%: " + model.nbToString(model.computeDurationPc(dur, 0)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(0), 0, 0) + ")"),
                      ("50\x8560%: " + model.nbToString(model.computeDurationPc(dur, 1)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(1), 0, 0) + ")"),
                      ("60\x8570%: " + model.nbToString(model.computeDurationPc(dur, 2)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(2), 0, 0) + ")")); }
        break;
      case 0x10a: {
        this.drawBody("70\x8580%: " + model.durationToString(0, model.computeTotalRRI(3) / 1.024, true),
                      "80\x8590%: " + model.durationToString(0, model.computeTotalRRI(4) / 1.024, true),
                      "90\x85100%: " + model.durationToString(0, model.computeTotalRRI(5) / 1.024, true)); }
        break;
      case 0x10b: {
        this.drawBody(("70\x8580%: " + model.nbToString(model.computeDurationPc(dur, 3)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(3), 0, 0) + ")"),
                      ("80\x8590%: " + model.nbToString(model.computeDurationPc(dur, 4)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(4), 0, 0) + ")"),
                      ("90\x85100%: " + model.nbToString(model.computeDurationPc(dur, 5)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(5), 0, 0) + ")")); }
        break;
      case 0x10c: {
        const totalDur = model.computeTotalRRI() / 1.024;
        this.drawBody(">= 100%: " + model.durationToString(0, model.computeTotalRRI(6) / 1.024, true),
                      "Total: " + model.durationToString(0, totalDur, true),
                      "Missing:  " + model.durationToString(0, dur - totalDur, true)); }
        break;
      case 0x10d: {
        const totalDur = model.computeTotalRRI() / 1.024;
        this.drawBody((">= 100%: " + model.nbToString(model.computeDurationPc(dur, 6)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(6), 0, 0) + ")"),
                      ("Total: " + model.nbToString(model.computeDurationPc(dur, undefined)) +
                       "% (\x80 " + model.hrToString(model.computeAvgHR(undefined), 0, 0) + ")"),
                      "Missing:  " + model.nbToString(100.0 * ((dur - totalDur) / dur)) + "%"); }
        break;
      case 0x10e: {
        if(HRW_ALERT_THRESHOLD === undefined) {
          this.drawBody("Alert: off");
        }
        else {
          const maxHr = model.computeMaxHR(HRW_AGE);
          this.drawBody(("Alert: " + model.nbToString(HRW_ALERT_THRESHOLD) +
                         "% \x85 HR: " + model.nbToString((HRW_ALERT_THRESHOLD / 100) * maxHr)),
                        (" Dur: " + model.durationToString(0, model.alertDur, true) +
                         " (" + model.nbToString(100.0 * (model.alertDur / dur)) + "%)"),
                        ("Inst:  " + model.durationToString(0, model.alertInstDur / 1.024, true) +
                         " (" + model.nbToString(100.0 * (model.alertInstDur / (1.024 * dur))) + "%)"));
        } }
        break;
      case 0x10f: {
        this.drawBody("RRI count: " + model.computeTotalRRICount(),
                      "AVG RRI: " + model.nbToString(model.computeTotalAvgRRI() / 1.024) + " ms"); }
        break;
      case 0x110: {
        this.drawBody("Skewness: " + model.nbToString(model.computeTotalRRISkewness()),
                      "Kurtosis: " + model.nbToString(model.computeTotalRRIKurtosis())); }
        break;
      case 0x111: {
        const si = model.computeStressIndex();
        this.drawBody("Str. idx: " + model.nbToString(si),
                      "SQRT(SI): " + model.nbToString(Math.sqrt(si))); }
        break;
      case 0x112: {
        this.drawBody("Model update: " + model.nbToString(this.modelUpdateDur) + " ms",
                      "RRI Buf count: " + model.rrArray[1],
                      "RRI Buf idx: " + model.rrArray[0]); }
        break;  
    }
    o.flip();
  },

  drawError: function(reason) {
    o.on();
    o.gfx.clear();
    o.gfx.setFontVector(10);
    o.gfx.drawString(reason, 0, 0);
    o.flip();
  },

  updatePanel: function(modelUpdateDur) {
    this.modelUpdateDur = modelUpdateDur;
    if(this.panelIdx !== -1) {
      this.panels[this.panelIdx][0].call(this);
    }
  },

  incPanel: function() {
    if(this.timeoutId !== -1) {
      clearTimeout(this.timeoutId);
      this.timeoutId = -1;
    }
    this.panelTimeout = undefined;
    this.panelIdx = this.nextPanelIdx;
    let panel = this.panels[this.panelIdx];
    let idx2 = undefined;
    if(panel.length > 2) {
      idx2 = panel[2];
    }
    let timeout = undefined;
    if(panel.length > 3) {
      timeout = panel[3];
    }
    this.nextPanel(panel[1], idx2, timeout);
    this.updatePanel();
  },

  reset: function() {
    this.panelIdx = -1;
    this.nextPanelIdx = 0;
    this.panelTimeout = undefined;
    this.timeoutId = -1;
    this.modelUpdateDur = undefined;
  },
};

function connectToHRM(s) {
  NRF.connect(HRW_HRMONITOR_ADDR).then(function(g) {
    if(s !== undefined) {
      model.reset();
      model.startDate = Date.now();
    }
    gatt = g;
    gatt.device.on('gattserverdisconnected', function(reason) {
      if(reason !== 0x16) {
        model.handleError();
        gui.drawError("gdisconnected: " + reason);
        gatt = undefined;
        setTimeout(()=>{connectToHRM(undefined);}, 3000);
      }
    });
    return gatt.getPrimaryService(0x180d);
  }).then(function(service) {
    return service.getCharacteristic(0x2a37);
  }).then(function(characteristic) {
    characteristic.on('characteristicvaluechanged', function(event) {
	const start = Date.now();  
	model.update(event.target.value);
	gui.updatePanel(Date.now() - start);
    });
    return characteristic.startNotifications();
  }).then(function() {
    console.log("Done!");
  }).catch(function(error) {
    model.handleError();
    gui.drawError(error);
    setTimeout(()=>{o.off();}, 3000);
    console.log(error);
  });
}

function disconnectHRM() {
  if(gatt !== undefined) {
    gatt.disconnect();
    gatt = undefined;
    model.endDate = Date.now();
  }
}

function revertBT() {
  adv_enabled = !adv_enabled;
  if(adv_enabled) {
    NRF.wake();
    E.lockConsole();
  }
  else {
    NRF.sleep();
  }
}

function buttonHandler(s) {
  if(!o.isOn) {
    gui.reset();
  }
  gui.incPanel();
}

setInterval(() => {
  E.kickWatchdog();
}, 2000);

setTimeout(() => {
  o.setContrast(10);
  setWatch(buttonHandler, BTN1, true);
  setWatch(() => {gui.updatePanel();}, D2, true);  
}, 3000);

setupSerial();// first set to known state
// now pause serial console for power saving, it will be enabled when RX goes high
// it should be enough to connect to serial adapter
pauseConsole(Serial1);

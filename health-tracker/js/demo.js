/* Clearly FICTIONAL demo data so people can try the app.
 * No real person or real medical record is represented here. */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var m = factory(isNode ? require('./calc.js') : root.KT.calc);
  if (isNode) module.exports = m;
  else { root.KT = root.KT || {}; root.KT.demo = m; }
})(typeof self !== 'undefined' ? self : this, function (calc) {
  'use strict';

  function build(today) {
    today = today || calc.todayISO();
    var id = 0;
    function nid(p) { return 'demo-' + p + '-' + (++id); }
    var labs = [], vitals = [], injections = [];
    var hb = [8.6, 8.9, 9.3, 9.8, 10.1, 10.4, 10.2, 10.6];
    var cr = [3.4, 3.5, 3.5, 3.7, 3.8, 3.8, 4.0, 4.1];
    var k = [5.3, 5.6, 5.1, 4.9, 5.4, 5.8, 5.2, 5.0];
    for (var i = 0; i < 8; i++) {
      var d = calc.addMonths(today, i - 8);
      var v = { hb: hb[i], creatinine: cr[i], urea: 78 + i * 3, potassium: k[i], sodium: 137 + (i % 3), calcium: 8.4 + (i % 4) * 0.1,
        phosphorus: 4.6 + (i % 3) * 0.3, albumin: 3.6 + (i % 2) * 0.2 };
      if (i % 3 === 0) { v.pth = 180 + i * 12; v.ferritin = 210 + i * 15; v.tsat = 18 + i; v.pcv = 27 + i * 0.8; }
      if (i === 4) { v.vitd = 21; v.uricacid = 7.4; v.bicarbonate = 20; }
      labs.push({ id: nid('lab'), date: d, labName: 'Demo Lab (काल्पनिक)', values: v, notes: i === 7 ? 'उदाहरण / example' : '' });
    }
    for (var j = 0; j < 14; j++) {
      var vd = calc.addDays(today, -j * 8);
      vitals.push({ id: nid('vit'), datetime: vd + 'T08:' + (10 + j), sys: 128 + ((j * 7) % 18), dia: 78 + ((j * 5) % 10),
        pulse: 76 + (j % 6), weight: 58.5 + (j % 4) * 0.3, notes: j === 2 ? 'पैरों में हल्की सूजन / mild ankle swelling' : '' });
    }
    for (var w = 0; w < 6; w++) {
      injections.push({ id: nid('inj'), date: calc.addDays(today, -6 - w * 7), medicine: 'Demo EPO (example)', dose: 4000, unit: 'IU',
        site: w % 2 ? 'बायाँ हाथ / left arm' : 'दायाँ हाथ / right arm', givenBy: 'Demo Nurse', frequency: 'weekly' });
    }
    injections.push({ id: nid('inj'), date: calc.addDays(today, -25), medicine: 'Demo Iron (example)', dose: 100, unit: 'mg',
      site: 'IV', givenBy: 'Demo Hospital', frequency: 'monthly' });
    return {
      profile: {
        name: 'Demo Patient (काल्पनिक / fictional)', sex: 'f', dob: '1968-05-10', height: 155,
        diagnosis: 'Example: CKD due to diabetes (fictional)', stage: '4', bloodGroup: 'B+',
        allergies: 'Example: sulfa drugs (fictional)',
        cautions: 'Example only: avoid painkillers like ibuprofen (NSAIDs)\nExample only: no contrast dye without nephrologist approval',
        doctor: 'Dr. Example Nephrologist', doctorPhone: '00000 00000',
        hospital: 'Example City Hospital', hospitalPhone: '00000 00001'
      },
      settings: { dialysisEnabled: false, targets: {}, ranges: {}, customTests: [] },
      labs: labs, vitals: vitals, injections: injections,
      meds: [
        { id: nid('med'), name: 'Demo tablet A (example)', strength: '40 mg', dose: '1 tab', timing: '1-0-0', food: 'after', start: calc.addMonths(today, -6), prescribedBy: 'Dr. Example' },
        { id: nid('med'), name: 'Demo binder B (example)', strength: '500 mg', dose: '1 tab', timing: '1-1-1', food: 'with', start: calc.addMonths(today, -4), prescribedBy: 'Dr. Example' },
        { id: nid('med'), name: 'Demo vitamin C (example)', strength: '0.25 mcg', dose: '1 cap', timing: '0-0-1', food: 'after', start: calc.addMonths(today, -3), prescribedBy: 'Dr. Example' },
        { id: nid('med'), name: 'Old demo med (stopped)', strength: '10 mg', dose: '1 tab', timing: '1-0-1', food: 'before', start: calc.addMonths(today, -8), stop: calc.addMonths(today, -2), prescribedBy: 'Dr. Example' }
      ],
      visits: [
        { id: nid('vis'), date: calc.addMonths(today, -1), doctor: 'Dr. Example Nephrologist', hospital: 'Example City Hospital',
          advice: 'Example advice: low-salt diet, repeat tests in 1 month (fictional)', nextDate: calc.addDays(today, 12),
          questions: 'Example: Is my potassium OK?\nExample: Should I see a dietitian?' }
      ],
      dialysis: []
    };
  }

  return { build: build };
});

/* Fictional sample data for training and testing. Loaded only from Import / Export > Load demo data.
   None of these records describe real NAAMII assets, projects or funders. */
AMS.demoData = function () {
  var s = AMS.blankState();
  s.locations.push({ code: 'LAB-A', name: 'Demo Lab A', type: 'Lab', inCharge: 'Demo Lab Lead' },
    { code: 'FIELD-1', name: 'Demo field site', type: 'Field site', inCharge: '' });
  s.projects = [
    { code: 'DEMO-R1', name: 'Demo restricted grant (closed)', funder: 'Demo Foundation', fundingType: 'Restricted grant', defaultOwnership: 'Funder',
      assetTerm: 'To be confirmed', agreementRef: 'Art. 9 Equipment', startDate: '2024-01-01', endDate: '2026-06-30', manager: 'Demo PM One', status: 'Closed', notes: 'Sample only' },
    { code: 'DEMO-R2', name: 'Demo restricted grant (active)', funder: 'Demo Agency', fundingType: 'Restricted grant', defaultOwnership: 'Funder',
      assetTerm: 'Vests in NAAMII', agreementRef: 'Clause 14.2', startDate: '2025-09-01', endDate: '2027-08-31', manager: 'Demo PM Two', status: 'Active', notes: 'Sample only' },
    { code: 'DEMO-SVC', name: 'Demo service contract', funder: 'Demo Client', fundingType: 'Service contract', defaultOwnership: 'NAAMII',
      assetTerm: 'Not applicable', agreementRef: '', startDate: '2026-01-15', endDate: '2026-12-31', manager: 'Demo PM One', status: 'Active', notes: 'Sample only' }
  ];
  function asset(o) {
    var base = { description: '', makeModel: '', serialNo: '', projectCode: '', funder: '', endOfProjectTerm: 'Not applicable', agreementRef: '',
      vendor: 'Demo Vendor Pvt. Ltd.', invoiceNo: '', poNo: '', receivedFrom: '', custodian: '', condition: 'Good', warrantyExpiry: '', lastVerifiedDate: '',
      depStartDate: '', depBaseValue: '', usefulLifeYears: '', residualValue: '', itaBlock: '', notes: 'Sample record', status: 'In use', acquisitionMode: 'Purchased' };
    Object.keys(o).forEach(function (k) { base[k] = o[k]; });
    return base;
  }
  s.assets = [
    asset({ id: 'NAAMII-IT-0001', name: 'Demo GPU workstation', categoryCode: 'IT', fundingType: 'Unrestricted / core', ownership: 'NAAMII',
      acquisitionDate: '2025-08-20', cost: 650000, locationCode: 'LAB-A', custodian: 'Demo Researcher A', usefulLifeYears: 4, residualValue: 0, itaBlock: 'B', lastVerifiedDate: '2026-07-20' }),
    asset({ id: 'NAAMII-IT-0002', name: 'Demo laptop', categoryCode: 'IT', projectCode: 'DEMO-SVC', fundingType: 'Service contract', funder: 'Demo Client', ownership: 'NAAMII',
      acquisitionDate: '2026-02-10', cost: 185000, locationCode: 'OFFICE', custodian: 'Demo Staff B', usefulLifeYears: 4, residualValue: 0, itaBlock: 'B', warrantyExpiry: '2026-12-20' }),
    asset({ id: 'NAAMII-FUR-0001', name: 'Demo office desks (set of 6)', categoryCode: 'FUR', fundingType: 'Unrestricted / core', ownership: 'NAAMII',
      acquisitionDate: '2026-05-05', cost: 96000, locationCode: 'OFFICE', usefulLifeYears: 7, residualValue: 0, itaBlock: 'B' }),
    asset({ id: 'NAAMII-MED-0001', name: 'Demo portable ultrasound probe', categoryCode: 'MED', projectCode: 'DEMO-R2', fundingType: 'Restricted grant', funder: 'Demo Agency',
      ownership: 'Funder', endOfProjectTerm: 'Vests in NAAMII', agreementRef: 'Clause 14.2', acquisitionDate: '2025-11-03', cost: 720000, locationCode: 'LAB-A', custodian: 'Demo Researcher C' }),
    asset({ id: 'NAAMII-IT-0003', name: 'Demo edge computing kit', categoryCode: 'IT', projectCode: 'DEMO-R1', fundingType: 'Restricted grant', funder: 'Demo Foundation',
      ownership: 'Funder', endOfProjectTerm: 'To be confirmed', agreementRef: 'Art. 9 Equipment', acquisitionDate: '2024-04-18', cost: 240000, locationCode: 'FIELD-1', custodian: 'Demo PM One' }),
    asset({ id: 'NAAMII-LAB-0001', name: 'Demo sensor array', categoryCode: 'LAB', projectCode: 'DEMO-R1', fundingType: 'In-kind / transferred in', funder: 'Demo Foundation',
      ownership: 'Funder', endOfProjectTerm: 'Hand over as instructed', acquisitionMode: 'Received from partner', receivedFrom: 'Demo Partner Organisation', vendor: '',
      acquisitionDate: '2024-09-01', cost: 310000, locationCode: 'STORE', status: 'In store', condition: 'Fair' }),
    asset({ id: 'NAAMII-OFF-0001', name: 'Demo printer', categoryCode: 'OFF', fundingType: 'Unrestricted / core', ownership: 'NAAMII',
      acquisitionDate: '2023-10-01', cost: 45000, locationCode: 'OFFICE', usefulLifeYears: 5, residualValue: 0, itaBlock: 'B', status: 'Damaged', condition: 'Not working' })
  ];
  s.movements = [
    { id: 'MOV-00001', assetId: 'NAAMII-LAB-0001', date: '2024-09-01', type: 'Received in', fromLocation: '', toLocation: 'STORE', fromCustodian: 'Demo Partner Organisation', toCustodian: '',
      details: 'Received from Demo Partner Organisation on funder instruction', ref: 'Handover note DEMO/01', by: 'Demo data' }
  ];
  s.maintenance = [
    { id: 'MNT-00001', assetId: 'NAAMII-OFF-0001', reportedDate: '2026-10-05', type: 'Damage report', issue: 'Paper feed broken; not printing', reportedBy: 'Demo Staff B',
      serviceProvider: '', cost: '', chargedTo: '', status: 'Open', completedDate: '', remarks: '', prevStatus: 'In use' }
  ];
  s.audit.push({ at: new Date().toISOString(), user: 'System', role: '', action: 'Load', entity: 'Demo data', id: '', detail: 'Fictional sample records loaded' });
  return s;
};

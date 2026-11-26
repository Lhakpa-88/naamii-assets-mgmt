/* NAAMII Asset Management System — configuration, field definitions, permissions.
   Plain scripts (no build step) so the app runs on GitHub Pages, a file share, or any web server. */
window.AMS = window.AMS || {};

AMS.VERSION = '1.0.0';

AMS.OPTIONS = {
  fundingType: ['Restricted grant', 'Unrestricted / core', 'Service contract', 'In-kind / transferred in'],
  ownership: ['NAAMII', 'Funder', 'Partner / third party'],
  endOfProjectTerm: ['Not applicable', 'Vests in NAAMII', 'Return to funder', 'Hand over as instructed', 'To be confirmed'],
  acquisitionMode: ['Purchased', 'Received from partner', 'Donated to NAAMII', 'Transferred from another project'],
  status: ['In use', 'In store', 'Under maintenance', 'Damaged', 'Lost / stolen', 'Handed over', 'Returned to funder', 'Disposed'],
  condition: ['Good', 'Fair', 'Poor', 'Not working'],
  itaBlock: ['A', 'B', 'C', 'D', 'E'],
  projectStatus: ['Active', 'Closed'],
  locationType: ['Lab', 'Office', 'Store', 'Field site', 'External'],
  movementType: ['Custody / location change', 'Received in', 'Title transfer to NAAMII', 'Status change', 'Physical verification'],
  maintenanceType: ['Repair', 'Damage report', 'Preventive service', 'Calibration'],
  maintenanceStatus: ['Open', 'In progress', 'Completed', 'Beyond repair'],
  disposalMethod: ['Auction', 'Donation', 'Scrap', 'Handover to third party', 'Return to funder'],
  disposalStatus: ['Proposed', 'Approved', 'Completed', 'Rejected']
};

/* Statuses that mean the asset has left NAAMII's custody for good. */
AMS.EXITED = ['Handed over', 'Returned to funder', 'Disposed'];
AMS.EXIT_STATUS_BY_METHOD = {
  'Auction': 'Disposed', 'Donation': 'Disposed', 'Scrap': 'Disposed',
  'Handover to third party': 'Handed over', 'Return to funder': 'Returned to funder'
};

/* Income Tax Act 2058, Schedule 2, s.3(1): pool rates, diminishing balance. Block E is straight-line over life. */
AMS.ITA_RATES = { A: 0.05, B: 0.25, C: 0.20, D: 0.15 };
AMS.ITA_BLOCK_DESC = {
  A: 'Buildings and similar permanent structures',
  B: 'Computers, data equipment, furniture, fixtures, office equipment',
  C: 'Automobiles, buses, minibuses',
  D: 'Other depreciable assets (incl. research and lab equipment)',
  E: 'Intangible assets (cost ÷ useful life)'
};

AMS.ROLES = {
  admin: 'Administration',
  logistics: 'Logistics',
  pm: 'Project Manager'
};

/* What each role may do. On a static site this guides the screens; it is not a security boundary. */
AMS.PERMISSIONS = {
  admin: ['asset.edit', 'movement.add', 'maintenance.add', 'maintenance.update', 'verify', 'title.transfer',
    'disposal.propose', 'disposal.approve', 'disposal.complete', 'project.edit', 'setup.edit',
    'data.import', 'data.export', 'data.reset', 'audit.view'],
  logistics: ['asset.edit', 'movement.add', 'maintenance.add', 'maintenance.update', 'verify',
    'disposal.propose', 'disposal.complete', 'data.import', 'data.export'],
  pm: ['maintenance.add', 'disposal.propose', 'data.export']
};

AMS.ASSET_FIELDS = [
  { key: 'id', label: 'Asset ID', type: 'text', group: 'Identification', help: 'Leave blank to generate automatically' },
  { key: 'name', label: 'Asset Name', type: 'text', required: true, group: 'Identification' },
  { key: 'categoryCode', label: 'Category Code', type: 'ref', ref: 'categories', required: true, group: 'Identification' },
  { key: 'makeModel', label: 'Make / Model', type: 'text', group: 'Identification' },
  { key: 'serialNo', label: 'Serial No', type: 'text', group: 'Identification' },
  { key: 'description', label: 'Description', type: 'textarea', group: 'Identification' },

  { key: 'projectCode', label: 'Project Code', type: 'ref', ref: 'projects', group: 'Funding and ownership', help: 'Leave blank for core / operations' },
  { key: 'fundingType', label: 'Funding Type', type: 'select', options: 'fundingType', required: true, group: 'Funding and ownership' },
  { key: 'funder', label: 'Funder', type: 'text', group: 'Funding and ownership' },
  { key: 'ownership', label: 'Ownership', type: 'select', options: 'ownership', required: true, group: 'Funding and ownership', help: 'Who holds title under the agreement' },
  { key: 'endOfProjectTerm', label: 'End-of-Project Term', type: 'select', options: 'endOfProjectTerm', group: 'Funding and ownership' },
  { key: 'agreementRef', label: 'Agreement Clause / Ref', type: 'text', group: 'Funding and ownership' },

  { key: 'acquisitionMode', label: 'Acquisition Mode', type: 'select', options: 'acquisitionMode', required: true, group: 'Acquisition' },
  { key: 'acquisitionDate', label: 'Acquisition Date', type: 'date', required: true, group: 'Acquisition' },
  { key: 'cost', label: 'Cost (NPR)', type: 'number', group: 'Acquisition', help: 'Invoice cost incl. non-recoverable VAT; for items received, the value stated on the handover document' },
  { key: 'vendor', label: 'Vendor', type: 'text', group: 'Acquisition' },
  { key: 'invoiceNo', label: 'Invoice No', type: 'text', group: 'Acquisition' },
  { key: 'poNo', label: 'PO No', type: 'text', group: 'Acquisition' },
  { key: 'receivedFrom', label: 'Received From', type: 'text', group: 'Acquisition', help: 'Partner or donor that handed the item over' },

  { key: 'locationCode', label: 'Location Code', type: 'ref', ref: 'locations', group: 'Location and custody' },
  { key: 'custodian', label: 'Custodian', type: 'text', group: 'Location and custody' },
  { key: 'status', label: 'Status', type: 'select', options: 'status', required: true, group: 'Location and custody' },
  { key: 'condition', label: 'Condition', type: 'select', options: 'condition', group: 'Location and custody' },
  { key: 'warrantyExpiry', label: 'Warranty Expiry', type: 'date', group: 'Location and custody' },
  { key: 'lastVerifiedDate', label: 'Last Verified Date', type: 'date', group: 'Location and custody' },

  { key: 'depStartDate', label: 'Depreciation Start Date', type: 'date', group: 'Depreciation (NAAMII-owned only)', help: 'Defaults to acquisition date' },
  { key: 'depBaseValue', label: 'Depreciable Value (NPR)', type: 'number', group: 'Depreciation (NAAMII-owned only)', help: 'Defaults to cost' },
  { key: 'usefulLifeYears', label: 'Useful Life (Years)', type: 'number', group: 'Depreciation (NAAMII-owned only)' },
  { key: 'residualValue', label: 'Residual Value (NPR)', type: 'number', group: 'Depreciation (NAAMII-owned only)' },
  { key: 'itaBlock', label: 'ITA Block', type: 'select', options: 'itaBlock', group: 'Depreciation (NAAMII-owned only)' },

  { key: 'notes', label: 'Notes', type: 'textarea', group: 'Other' }
];

AMS.PROJECT_FIELDS = [
  { key: 'code', label: 'Project Code', type: 'text', required: true },
  { key: 'name', label: 'Project Name', type: 'text', required: true },
  { key: 'funder', label: 'Funder', type: 'text' },
  { key: 'fundingType', label: 'Funding Type', type: 'select', options: 'fundingType', required: true },
  { key: 'defaultOwnership', label: 'Default Asset Ownership', type: 'select', options: 'ownership', help: 'Title to assets bought under this agreement' },
  { key: 'assetTerm', label: 'End-of-Project Term', type: 'select', options: 'endOfProjectTerm' },
  { key: 'agreementRef', label: 'Agreement Clause / Ref', type: 'text' },
  { key: 'startDate', label: 'Start Date', type: 'date' },
  { key: 'endDate', label: 'End Date', type: 'date' },
  { key: 'manager', label: 'Project Manager', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: 'projectStatus', required: true },
  { key: 'notes', label: 'Notes', type: 'textarea' }
];

AMS.LOCATION_FIELDS = [
  { key: 'code', label: 'Location Code', type: 'text', required: true },
  { key: 'name', label: 'Location Name', type: 'text', required: true },
  { key: 'type', label: 'Type', type: 'select', options: 'locationType' },
  { key: 'inCharge', label: 'In-Charge', type: 'text' }
];

AMS.CATEGORY_FIELDS = [
  { key: 'code', label: 'Category Code', type: 'text', required: true },
  { key: 'name', label: 'Category Name', type: 'text', required: true },
  { key: 'itaBlock', label: 'ITA Block', type: 'select', options: 'itaBlock' },
  { key: 'usefulLifeYears', label: 'Useful Life (Years)', type: 'number' }
];

AMS.MOVEMENT_FIELDS = [
  { key: 'id', label: 'Movement ID', type: 'text' },
  { key: 'assetId', label: 'Asset ID', type: 'text', required: true },
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'type', label: 'Type', type: 'select', options: 'movementType', required: true },
  { key: 'fromLocation', label: 'From Location', type: 'text' },
  { key: 'toLocation', label: 'To Location', type: 'text' },
  { key: 'fromCustodian', label: 'From Custodian', type: 'text' },
  { key: 'toCustodian', label: 'To Custodian', type: 'text' },
  { key: 'details', label: 'Details', type: 'textarea' },
  { key: 'ref', label: 'Document Ref', type: 'text' },
  { key: 'by', label: 'Recorded By', type: 'text' }
];

AMS.MAINTENANCE_FIELDS = [
  { key: 'id', label: 'Maintenance ID', type: 'text' },
  { key: 'assetId', label: 'Asset ID', type: 'text', required: true },
  { key: 'reportedDate', label: 'Reported Date', type: 'date', required: true },
  { key: 'type', label: 'Type', type: 'select', options: 'maintenanceType', required: true },
  { key: 'issue', label: 'Issue / Work Needed', type: 'textarea', required: true },
  { key: 'reportedBy', label: 'Reported By', type: 'text' },
  { key: 'serviceProvider', label: 'Service Provider', type: 'text' },
  { key: 'cost', label: 'Cost (NPR)', type: 'number' },
  { key: 'chargedTo', label: 'Charged To (Project Code)', type: 'text' },
  { key: 'status', label: 'Status', type: 'select', options: 'maintenanceStatus', required: true },
  { key: 'completedDate', label: 'Completed Date', type: 'date' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' }
];

AMS.DISPOSAL_FIELDS = [
  { key: 'id', label: 'Disposal ID', type: 'text' },
  { key: 'assetId', label: 'Asset ID', type: 'text', required: true },
  { key: 'method', label: 'Method', type: 'select', options: 'disposalMethod', required: true },
  { key: 'status', label: 'Status', type: 'select', options: 'disposalStatus', required: true },
  { key: 'proposedDate', label: 'Proposed Date', type: 'date', required: true },
  { key: 'proposedBy', label: 'Proposed By', type: 'text' },
  { key: 'reason', label: 'Reason', type: 'textarea' },
  { key: 'funderApprovalRef', label: 'Funder Approval Ref', type: 'text' },
  { key: 'approvedBy', label: 'Approved By', type: 'text' },
  { key: 'approvedDate', label: 'Approved Date', type: 'date' },
  { key: 'completedDate', label: 'Completed Date', type: 'date' },
  { key: 'recipient', label: 'Buyer / Recipient', type: 'text' },
  { key: 'proceeds', label: 'Proceeds (NPR)', type: 'number' },
  { key: 'disposalCost', label: 'Disposal Cost (NPR)', type: 'number' },
  { key: 'bookValueAtDisposal', label: 'Book Value at Disposal (NPR)', type: 'number' },
  { key: 'gainLoss', label: 'Gain / (Loss) (NPR)', type: 'number' },
  { key: 'documentRef', label: 'Document Ref', type: 'text' },
  { key: 'remarks', label: 'Remarks', type: 'textarea' }
];

/* Excel sheets: order matters on import (masters first so assets can be validated against them). */
AMS.SHEETS = [
  { name: 'Projects', key: 'projects', fields: AMS.PROJECT_FIELDS, idKey: 'code' },
  { name: 'Locations', key: 'locations', fields: AMS.LOCATION_FIELDS, idKey: 'code' },
  { name: 'Categories', key: 'categories', fields: AMS.CATEGORY_FIELDS, idKey: 'code' },
  { name: 'Assets', key: 'assets', fields: AMS.ASSET_FIELDS, idKey: 'id' },
  { name: 'Movements', key: 'movements', fields: AMS.MOVEMENT_FIELDS, idKey: 'id' },
  { name: 'Maintenance', key: 'maintenance', fields: AMS.MAINTENANCE_FIELDS, idKey: 'id' },
  { name: 'Disposals', key: 'disposals', fields: AMS.DISPOSAL_FIELDS, idKey: 'id' }
];

/* Starting masters. Useful lives are placeholders: align them with the FMCM / accounting policy in Setup. */
AMS.DEFAULT_CATEGORIES = [
  { code: 'IT', name: 'Computers and IT equipment', itaBlock: 'B', usefulLifeYears: 4 },
  { code: 'OFF', name: 'Office equipment', itaBlock: 'B', usefulLifeYears: 5 },
  { code: 'FUR', name: 'Furniture and fixtures', itaBlock: 'B', usefulLifeYears: 7 },
  { code: 'LAB', name: 'Research and lab equipment', itaBlock: 'D', usefulLifeYears: 5 },
  { code: 'MED', name: 'Medical and imaging devices', itaBlock: 'D', usefulLifeYears: 5 },
  { code: 'VEH', name: 'Vehicles', itaBlock: 'C', usefulLifeYears: 7 },
  { code: 'BLD', name: 'Buildings and structures', itaBlock: 'A', usefulLifeYears: 20 },
  { code: 'SW', name: 'Software and intangibles', itaBlock: 'E', usefulLifeYears: 3 },
  { code: 'OTH', name: 'Other equipment', itaBlock: 'D', usefulLifeYears: 5 }
];
AMS.DEFAULT_LOCATIONS = [
  { code: 'OFFICE', name: 'Main office', type: 'Office', inCharge: '' },
  { code: 'STORE', name: 'Store room', type: 'Store', inCharge: '' }
];
AMS.DEFAULT_SETTINGS = {
  orgName: 'NAAMII',
  idPrefix: 'NAAMII',
  fyStartMonth: 7, fyStartDay: 16,       // Shrawan 1 falls on 16 or 17 July
  tier1End: '01-14',                      // end of Poush (approx.)
  tier2End: '04-13',                      // end of Chaitra (approx.)
  capThreshold: 0,                        // NAAMII-owned items below this cost are expensed, not capitalised
  itaOpeningFy: '',                       // FY start year the opening pool balances relate to
  itaOpening: { A: 0, B: 0, C: 0, D: 0 }
};

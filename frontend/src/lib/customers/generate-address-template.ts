import * as XLSX from 'xlsx';

export function downloadCustomerAddressTemplate() {
  const headers = [
    'DealerCode',
    'DealerName',
    'Address',
    'DealerGroup',
    'Region',
    'ContactName',
    'ContactPhone',
  ];
  const rows = [
    {
      DealerCode: 'BYD-JKT-01',
      DealerName: 'BYD Jakarta Central',
      Address: 'Jl. Example No. 1, Jakarta',
      DealerGroup: 'Arista',
      Region: 'GREATER JAKARTA',
      ContactName: 'Budi',
      ContactPhone: '081234567890',
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 42 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'CustomerAddresses');
  XLSX.writeFile(workbook, 'customer-address-import-template.xlsx');
}

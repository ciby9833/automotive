import * as XLSX from 'xlsx';

// 生成出库订单导入模板 Excel（.xlsx）
// 列名和 parse-excel.ts 里的 COLUMN_MAP 保持一致
export function downloadOutboundTemplate() {
  const headers = [
    'VIN',
    'DealerCode',
    'TowType',
    'GroupCode',
  ];
  const sampleRows = [
    {
      VIN: 'LGXCE4CB6TG026488',
      DealerCode: 'BYD-JKT-01',
      TowType: 'CC',
      GroupCode: 'CC1',
    },
    {
      VIN: 'LGXCE4CB7TG026449',
      DealerCode: 'BYD-SBY-01',
      TowType: 'TOWING',
      GroupCode: 'CC2',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  ws['!cols'] = [
    { wch: 22 }, // VIN
    { wch: 18 }, // DealerCode
    { wch: 10 }, // TowType
    { wch: 12 }, // GroupCode
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OutboundVINs');
  XLSX.writeFile(wb, `outbound-import-template.xlsx`);
}

import * as XLSX from 'xlsx';

// 生成出库订单导入模板 Excel（.xlsx）
// 列名和 parse-excel.ts 里的 COLUMN_MAP 保持一致
export function downloadOutboundTemplate() {
  const headers = [
    'VIN',
    'Brand',
    'Model',
    'Color',
    'VehicleType',
    'DealerCode',
    'DealerName',
    'TowType',
    'GroupCode',
  ];
  const sampleRows = [
    {
      VIN: 'LGXCE4CB6TG026488',
      Brand: 'BYD',
      Model: 'SC2E-FWD-20',
      Color: 'SKI WHITE',
      VehicleType: 'Superior Captain',
      DealerCode: 'BYD-JKT-01',
      DealerName: 'BYD Jakarta Central',
      TowType: 'CC',
      GroupCode: 'CC1',
    },
    {
      VIN: 'LGXCE4CB7TG026449',
      Brand: 'BYD',
      Model: 'SC2E-FWD-20',
      Color: 'COSMOS BLACK',
      VehicleType: 'Superior Captain',
      DealerCode: 'BYD-SBY-01',
      DealerName: 'BYD Surabaya',
      TowType: 'TOWING',
      GroupCode: 'CC2',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  ws['!cols'] = [
    { wch: 22 }, // VIN
    { wch: 8 }, // Brand
    { wch: 16 }, // Model
    { wch: 14 }, // Color
    { wch: 20 }, // VehicleType
    { wch: 18 }, // DealerCode
    { wch: 24 }, // DealerName
    { wch: 10 }, // TowType
    { wch: 12 }, // GroupCode
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OutboundVINs');
  XLSX.writeFile(wb, `outbound-import-template.xlsx`);
}

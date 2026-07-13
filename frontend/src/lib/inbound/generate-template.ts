import * as XLSX from 'xlsx';

// 生成入库订单导入模板 Excel（.xlsx）
// 列名和 parse-excel.ts 里的 COLUMN_MAP 保持一致
export function downloadInboundTemplate() {
  const headers = ['VIN', 'Brand', 'Model', 'Color', 'VehicleType', 'MotorNo'];
  // 附一行示例数据，让操作员一眼看懂
  const sampleRows = [
    {
      VIN: 'LGXCE4CB6TG026488',
      Brand: 'BYD',
      Model: 'SC2E-FWD-20',
      Color: 'SKI WHITE',
      VehicleType: 'Superior Captain',
      MotorNo: 'TZ200XSQ 3F6022509',
    },
    {
      VIN: 'LGXCE4CB7TG026449',
      Brand: 'BYD',
      Model: 'SC2E-FWD-20',
      Color: 'COSMOS BLACK',
      VehicleType: 'Superior Captain',
      MotorNo: 'TZ200XSQ 3F6022426',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
  // 加宽列，避免看着挤
  ws['!cols'] = [
    { wch: 22 }, // VIN
    { wch: 8 }, // Brand
    { wch: 16 }, // Model
    { wch: 14 }, // Color
    { wch: 20 }, // VehicleType
    { wch: 20 }, // MotorNo
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'InboundVINs');
  XLSX.writeFile(wb, `inbound-import-template.xlsx`);
}

# App 车辆扫码

## 统一入口与业务边界

`core/scanner/VinBarcodeScanner.kt` 被独立运输提货/签收、入库扫描、提货扫描、运单装车共用；各业务页不单独配置码制。

- 使用随 APK 打包的 ML Kit 解码器，开启其支持的一维条码和二维码格式，包括 Code 128、Code 39、Code 93、QR Code、Data Matrix 等。
- 请求最高接近 1920×1080 的分析画面（设备不支持时回退），保留完整预览；点击对焦，可手动变焦/照明。退出时解绑本页相机用例、关闭解码器，丢弃迟到回调。
- 扫到非车辆码、多个不同 VIN、识别失败或相机启动失败时显示提示，不再静默无反应。多个不同 VIN 不自动选择第一个。
- 扫码仅返回车辆标识，不代替业务提交。独立运输仍需确认提货/签收；多路线仍由后端要求选择明细；入库照片、装车照片、机构及权限校验不变。二维码中的 URL 不会被打开或请求。

## 码内内容

支持以下明确内容，统一去除首尾空白、转大写：

| 内容 | 示例 |
| --- | --- |
| 原始车辆标识，8–32 位英文字母/数字 | `22222222222222222` |
| VIN 标签 | `VIN:22222222222222222` |
| JSON 顶层字符串字段 `vin`（字段名不区分大小写） | `{"vin":"22222222222222222"}` |
| HTTP(S) URL 的 `vin` 查询参数 | `https://example.test/car?vin=22222222222222222` |

不从任意长字符串中截取 17 位，不拼接被分隔的多个字段，不把订单号字段或任意 URL 路径猜成 VIN。二维码不是车辆标识时给出提示。JSON 中 VIN 应为字符串，避免数字表示丢失前导零或精度。

以前的固定 17 位规则和后端独立运输/入库的 8–32 位录入规则不一致；现在统一扫码输入口径，不修改后端数据或交易规则。这不是新增历史数据兼容层。

## 回归与边界（2026-09-23）

在 `app/alms` 设置 Android Studio JBR 后运行：

```bash
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew :app:testDevDebugUnitTest :app:assembleDevDebug :app:lintDevDebug
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew :app:connectedDevDebugAndroidTest
```

- 12 项纯解析测试：纯数字、8–32 位、大小写、JSON/URL、重复码、多车辆码、非法与超长内容、避免错误截取。
- 8 项 Android 模拟器真实解码测试：使用 ZXing **仅在测试包中**生成图片，再调用产品实际 ML Kit 工厂；Code 128/39/93、QR、Data Matrix 均将用户提供的 `22222222222222222` 还原为原值，另测 JSON/URL 二维码和非 VIN 二维码。
- 不访问业务接口或生成提货/签收记录。Bitmap 解码通过不等于已验证真实手机镜头、印刷质量、反光、摄像头权限和每个业务页面的完整操作。现场仍需安装新 APK，用原标签测试扫描、返回、反复进入及拍照存证。
- 此次未修改发布版本号、未上传/发布 APK；手机旧安装包不会随源码修改而自动更新。

相机图像分辨率、帧释放及码制配置依据：[ML Kit Android 条码文档](https://developers.google.com/ml-kit/vision/barcode-scanning/android)、[CameraX 图像分析](https://developer.android.com/media/camera/camerax/analyze)。

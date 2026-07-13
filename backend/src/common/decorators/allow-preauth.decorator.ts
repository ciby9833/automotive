import { SetMetadata } from '@nestjs/common';
import { ALLOW_PREAUTH_KEY } from '../guards/preauth-block.guard';

// 加在 controller 方法上表示允许 preAuth token 调用（仅供 auth 模块的选择机构/登出用）
export const AllowPreAuth = () => SetMetadata(ALLOW_PREAUTH_KEY, true);

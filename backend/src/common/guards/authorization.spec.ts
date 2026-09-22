import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { PermissionsGuard } from './permissions.guard';
import { Permissions } from '../decorators/permissions.decorator';
import { Permission } from '../enums/permission.enum';
import { Role } from '../enums/role.enum';
import { ACTIONS, MENUS, expandPermissions } from '../rbac/permission-catalog';
import {
  effectivePermissions,
  permissionsForRole,
} from '../rbac/role-permissions';

describe('authorization contract', () => {
  it('registers every permission and keeps read access separate from write and sibling menus', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      Object.values(Permission).sort(),
    );
    expect(new Set(MENUS.map((m) => m.key)).size).toBe(MENUS.length);
    expect(new Set(MENUS.map((m) => m.path)).size).toBe(MENUS.length);
    expect(expandPermissions(['menu:users'])).not.toContain(
      Permission.SETUP_USER_CRUD,
    );
    expect(expandPermissions(['menu:roles'])).not.toContain(
      Permission.SETUP_ROLE_MANAGE,
    );
    const planner = expandPermissions([
      'menu:outbound-plan',
      Permission.OUTBOUND_PLAN,
    ]);
    expect(planner).toContain(Permission.PARTNER_CARRIER_VIEW);
    expect(planner).not.toContain('menu:carriers');
    expect(planner).not.toContain(Permission.PARTNER_CARRIER_CRUD);
    expect(expandPermissions(['menu:transport'])).not.toContain(
      Permission.TRANSPORT_FINANCE_VIEW,
    );
    for (const menu of MENUS)
      for (const code of [...menu.read, ...menu.actions])
        expect(ACTIONS[code]).toBeDefined();
  });
  it('does not grant HQ business writes, even when they are assigned in storage', () => {
    expect(
      effectivePermissions(Role.HQ_ADMIN, [Permission.OUTBOUND_PLAN]),
    ).toEqual([]);
    expect(permissionsForRole(Role.HQ_ADMIN)).toContain(Permission.ORG_CRUD);
    expect(permissionsForRole(Role.HQ_ADMIN)).toContain(
      Permission.OUTBOUND_VIEW,
    );
    expect(permissionsForRole(Role.HQ_ADMIN)).not.toContain(
      Permission.TRANSPORT_EXECUTE,
    );
  });

  it('enforces assigned permissions instead of treating ORG_ADMIN as all-powerful', () => {
    class Endpoint {
      run(this: void) {}
    }
    Permissions(Permission.OUTBOUND_PLAN)(
      Endpoint.prototype,
      'run',
      Object.getOwnPropertyDescriptor(Endpoint.prototype, 'run')!,
    );
    const guard = new PermissionsGuard(new Reflector());
    const request = {
      user: { role: Role.ORG_ADMIN, permissions: [Permission.OUTBOUND_VIEW] },
    };
    const context = {
      getHandler: () => Endpoint.prototype.run,
      getClass: () => Endpoint,
      switchToHttp: () => ({ getRequest: () => request }),
    };
    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
    request.user.permissions.push(Permission.OUTBOUND_PLAN);
    expect(guard.canActivate(context as never)).toBe(true);
  });

  it('requires every HTTP endpoint to declare authorization (new features fail closed)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : [join(dir, entry.name)],
      );
    const missing: string[] = [];
    for (const file of walk(join(__dirname, '../..')).filter((f) =>
      f.endsWith('.controller.ts'),
    )) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      for (const c of source.statements.filter(ts.isClassDeclaration)) {
        const classNames = (ts.getDecorators(c) ?? []).map((d) =>
          d.getText(source),
        );
        if (
          classNames.includes('@Public()') ||
          classNames.includes('@SessionOnly()')
        )
          continue;
        for (const m of c.members.filter(ts.isMethodDeclaration)) {
          const names = (ts.getDecorators(m) ?? []).map((d) =>
            d.getText(source),
          );
          if (
            names.some((n) => /^@(Get|Post|Patch|Put|Delete)\(/.test(n)) &&
            !names.some((n) => /^@(Permissions|Public|SessionOnly)\(/.test(n))
          )
            missing.push(`${file}:${m.name.getText(source)}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

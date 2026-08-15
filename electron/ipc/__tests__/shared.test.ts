import { describe, it, expect, afterEach } from 'vitest';
import {
  normalizeWinPath,
  isPathInside,
  isAllowedExtension,
  SAFE_EXTENSIONS,
  EXCLUDED_DIRS,
  assertString,
  assertObject,
} from '../shared';

describe('normalizeWinPath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('将 /C/Users/... 形式转为 C:/Users/...', () => {
    // Force win32 for this test
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(normalizeWinPath('/c/Users/test/file.ts')).toBe('C:/Users/test/file.ts');
    expect(normalizeWinPath('/D/Projects/app/src')).toBe('D:/Projects/app/src');
  });

  it('已是正常 Windows 路径不改动', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(normalizeWinPath('C:\\Users\\test\\file.ts')).toBe('C:\\Users\\test\\file.ts');
  });

  it('相对路径不改动', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(normalizeWinPath('src/index.ts')).toBe('src/index.ts');
    expect(normalizeWinPath('./src/index.ts')).toBe('./src/index.ts');
  });

  it('不以 /X/ 开头的路径不改动', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    expect(normalizeWinPath('/home/user/file.txt')).toBe('/home/user/file.txt');
    expect(normalizeWinPath('/usr/local/bin')).toBe('/usr/local/bin');
  });
});

describe('isPathInside', () => {
  it('子路径在父路径内返回 true', () => {
    expect(isPathInside('/project/src/file.ts', '/project')).toBe(true);
    expect(isPathInside('/project/src/components/Modal.tsx', '/project/src')).toBe(true);
  });

  it('路径相等返回 true', () => {
    expect(isPathInside('/project', '/project')).toBe(true);
  });

  it('上级目录 .. 逃逸返回 false', () => {
    expect(isPathInside('/project/../etc/passwd', '/project')).toBe(false);
    expect(isPathInside('/project/src/../../outside', '/project')).toBe(false);
  });

  it('绝对路径逃逸返回 false', () => {
    // path.relative returns absolute when paths are on different drives on Windows
    // On POSIX: '/etc' relative to '/project' is '../etc'
    const result = isPathInside('/etc/passwd', '/project');
    expect(result).toBe(false);
  });

  it('深层嵌套合法路径返回 true', () => {
    expect(isPathInside('/a/b/c/d/e/file.txt', '/a')).toBe(true);
  });
});

describe('SAFE_EXTENSIONS', () => {
  it('包含常见编程语言和配置文件的扩展名', () => {
    expect(SAFE_EXTENSIONS.has('.ts')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.tsx')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.js')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.json')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.md')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.py')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.yaml')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.yml')).toBe(true);
    expect(SAFE_EXTENSIONS.has('.toml')).toBe(true);
  });

  it('不包含可执行文件扩展名', () => {
    expect(SAFE_EXTENSIONS.has('.exe')).toBe(false);
    expect(SAFE_EXTENSIONS.has('.sh')).toBe(false);
    expect(SAFE_EXTENSIONS.has('.dll')).toBe(false);
    expect(SAFE_EXTENSIONS.has('.bat')).toBe(false);
    expect(SAFE_EXTENSIONS.has('.msi')).toBe(false);
  });
});

describe('EXCLUDED_DIRS', () => {
  it('包含常见的排除目录', () => {
    expect(EXCLUDED_DIRS.has('node_modules')).toBe(true);
    expect(EXCLUDED_DIRS.has('.git')).toBe(true);
    expect(EXCLUDED_DIRS.has('dist')).toBe(true);
    expect(EXCLUDED_DIRS.has('coverage')).toBe(true);
    expect(EXCLUDED_DIRS.has('__pycache__')).toBe(true);
  });
});

describe('isAllowedExtension', () => {
  it('.ts / .css 等安全扩展名返回 true', () => {
    expect(isAllowedExtension('src/index.ts')).toBe(true);
    expect(isAllowedExtension('styles/main.css')).toBe(true);
    expect(isAllowedExtension('config.json')).toBe(true);
    expect(isAllowedExtension('README.md')).toBe(true);
    expect(isAllowedExtension('main.py')).toBe(true);
  });

  it('.exe / .dll 等不安全扩展名返回 false', () => {
    expect(isAllowedExtension('virus.exe')).toBe(false);
    expect(isAllowedExtension('lib.dll')).toBe(false);
    expect(isAllowedExtension('setup.msi')).toBe(false);
    expect(isAllowedExtension('run.sh')).toBe(false);
  });

  it('大小写不敏感', () => {
    expect(isAllowedExtension('Component.TS')).toBe(true);
    expect(isAllowedExtension('styles.CSS')).toBe(true);
    expect(isAllowedExtension('data.JSON')).toBe(true);
  });

  it('无扩展名的文件', () => {
    expect(isAllowedExtension('Makefile')).toBe(false);
    expect(isAllowedExtension('Dockerfile')).toBe(false);
  });

  it('空字符串安全处理', () => {
    expect(isAllowedExtension('')).toBe(false);
  });
});

describe('assertString', () => {
  it('合法字符串通过不抛异常', () => {
    expect(() => assertString('hello', 'testParam')).not.toThrow();
    expect(() => assertString('x', 'testParam')).not.toThrow();
  });

  it('空字符串默认抛出异常', () => {
    expect(() => assertString('', 'key')).toThrow('参数 key 必须是非空字符串');
  });

  it('allowEmpty=true 时空字符串通过', () => {
    expect(() => assertString('', 'opt', true)).not.toThrow();
  });

  it('null / undefined 抛出异常', () => {
    expect(() => assertString(null, 'key')).toThrow();
    expect(() => assertString(undefined, 'key')).toThrow();
  });

  it('数字抛出异常', () => {
    expect(() => assertString(123, 'key')).toThrow('参数 key 必须是非空字符串');
    expect(() => assertString(0, 'key2')).toThrow();
  });

  it('对象抛出异常', () => {
    expect(() => assertString({}, 'key')).toThrow();
    expect(() => assertString({ x: 1 }, 'key')).toThrow();
  });
});

describe('assertObject', () => {
  it('合法对象通过不抛异常', () => {
    expect(() => assertObject({}, 'config')).not.toThrow();
    expect(() => assertObject({ key: 'value' }, 'config')).not.toThrow();
    expect(() => assertObject({ nested: { a: 1 } }, 'config')).not.toThrow();
  });

  it('null 抛出异常', () => {
    expect(() => assertObject(null, 'config')).toThrow('参数 config 必须是对象');
  });

  it('数组抛出异常（Array.isArray 检查）', () => {
    expect(() => assertObject([], 'config')).toThrow('参数 config 必须是对象');
    expect(() => assertObject([1, 2, 3], 'config')).toThrow();
  });

  it('字符串抛出异常', () => {
    expect(() => assertObject('hello', 'config')).toThrow('参数 config 必须是对象');
  });

  it('数字抛出异常', () => {
    expect(() => assertObject(42, 'config')).toThrow('参数 config 必须是对象');
  });

  it('undefined 抛出异常', () => {
    expect(() => assertObject(undefined, 'config')).toThrow();
  });
});

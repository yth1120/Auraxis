param(
  [string]$ChildArgvJson,
  [string]$Cwd,
  [string]$ProjectRoot,
  [string]$WriteDir,
  [string]$CleanupOnly,
  [int]$WaitPid = 0,
  [string]$CleanupProjectRoot,
  [string]$CleanupWriteDir,
  [string]$CleanupSidString,
  [string]$CleanupMode = 'read',
  [string]$Mode = 'read'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$userTemp = Join-Path $env:USERPROFILE 'AppData\Local\Temp'
if (-not (Test-Path -LiteralPath $userTemp)) {
  New-Item -ItemType Directory -Path $userTemp -Force | Out-Null
}
$env:TEMP = $userTemp
$env:TMP = $userTemp

# powershell.exe (5.1) cannot autoload Microsoft.PowerShell.Security when the
# inherited PSModulePath contains PowerShell 7 module roots (e.g. the WindowsApps
# PS7 path) — pin a 5.1-compatible module path so Get-Acl/Set-Acl always resolve.
$env:PSModulePath = @(
  (Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\Modules'),
  (Join-Path $env:ProgramFiles 'WindowsPowerShell\Modules'),
  (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules')
) -join [IO.Path]::PathSeparator

Add-Type -TypeDefinition @"
using System;
using System.Collections;
using System.Runtime.InteropServices;
using System.Text;

public static class AuraxisAppContainer
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SID_AND_ATTRIBUTES
    {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SECURITY_CAPABILITIES
    {
        public SID_AND_ATTRIBUTES AppContainerSid;
        public IntPtr Capabilities;   // PSID_AND_ATTRIBUTES
        public uint CapabilityCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
        public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public short wShowWindow, cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

    [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int CreateAppContainerProfile(
        string pszAppContainerName,
        string pszDisplayName,
        string pszDescription,
        IntPtr pCapabilities,
        uint dwCapabilityCount,
        out IntPtr ppSid);

    [DllImport("userenv.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int DeleteAppContainerProfile(string pszAppContainerName);

    [DllImport("kernelbase.dll", SetLastError = true)]
    private static extern bool CreateAppContainerToken(
        IntPtr TokenHandle,
        ref SECURITY_CAPABILITIES SecurityCapabilities,
        out IntPtr NewTokenHandle);

    /// <summary>Create an AppContainer token from a base token (no extra capabilities).</summary>
    public static bool CreateContainerToken(IntPtr baseToken, IntPtr appContainerSid, out IntPtr newToken)
    {
        SECURITY_CAPABILITIES caps = new SECURITY_CAPABILITIES();
        caps.AppContainerSid.Sid = appContainerSid;
        caps.AppContainerSid.Attributes = 0;
        caps.Capabilities = IntPtr.Zero;
        caps.CapabilityCount = 0;
        return CreateAppContainerToken(baseToken, ref caps, out newToken);
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool ConvertSidToStringSidW(IntPtr Sid, out IntPtr StringSid);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr LocalFree(IntPtr hMem);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcessAsUserW(
        IntPtr hToken,
        string lpApplicationName,
        StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetInformationJobObject(
        IntPtr hJob,
        int JobObjectInformationClass,
        IntPtr lpJobObjectInformation,
        uint cbJobObjectInformationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint GetLastError();

    public static IntPtr CreateSandboxJob()
    {
        IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return IntPtr.Zero;
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.LimitFlags = 0x00002000 | 0x00000008; // KILL_ON_JOB_CLOSE | ACTIVE_PROCESS
        limits.ActiveProcessLimit = 64;
        int size = Marshal.SizeOf(limits);
        IntPtr ptr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(limits, ptr, false);
            if (!SetInformationJobObject(job, 9, ptr, (uint)size))
            {
                CloseHandle(job);
                return IntPtr.Zero;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
        return job;
    }

    public static int LaunchContainer(string commandLine, string cwd, IntPtr token, IntPtr env)
    {
        IntPtr job = CreateSandboxJob();
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        si.dwFlags = 0x00000100; // STARTF_USESTDHANDLES
        si.hStdInput = GetStdHandle(-10);
        si.hStdOutput = GetStdHandle(-11);
        si.hStdError = GetStdHandle(-12);
        uint flags = 0x00000004 | 0x00000200 | 0x00000400; // CREATE_SUSPENDED | CREATE_NEW_PROCESS_GROUP | CREATE_UNICODE_ENVIRONMENT
        PROCESS_INFORMATION pi;
        StringBuilder sb = new StringBuilder(commandLine);
        if (!CreateProcessAsUserW(token, null, sb, IntPtr.Zero, IntPtr.Zero, true, flags, env, cwd, ref si, out pi))
        {
            int err = (int)GetLastError();
            if (job != IntPtr.Zero) CloseHandle(job);
            return -err;
        }
        if (job != IntPtr.Zero) AssignProcessToJobObject(job, pi.hProcess);
        ResumeThread(pi.hThread);
        WaitForSingleObject(pi.hProcess, 0xFFFFFFFF);
        uint exitCode = 0;
        GetExitCodeProcess(pi.hProcess, out exitCode);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        if (job != IntPtr.Zero) CloseHandle(job);
        return (int)exitCode;
    }

    /// <summary>Convert a PSID pointer to its S-1-... string form.</summary>
    public static string SidToString(IntPtr sid)
    {
        IntPtr p;
        if (!ConvertSidToStringSidW(sid, out p) || p == IntPtr.Zero) return null;
        try
        {
            return Marshal.PtrToStringUni(p);
        }
        finally
        {
            LocalFree(p);
        }
    }

    public static IntPtr BuildEnvWithTemp(string tempDir)
    {
        IDictionary vars = Environment.GetEnvironmentVariables();
        StringBuilder sb = new StringBuilder();
        foreach (DictionaryEntry e in vars)
        {
            string key = e.Key as string;
            // Windows reads the first TEMP/TMP in the block, so skip the originals
            // and append a single container-writable pair at the end.
            if (key != null && e.Value != null &&
                !string.Equals(key, "TEMP", StringComparison.OrdinalIgnoreCase) &&
                !string.Equals(key, "TMP", StringComparison.OrdinalIgnoreCase))
            {
                sb.Append(key).Append('=').Append(e.Value).Append('\0');
            }
        }
        sb.Append("TEMP=").Append(tempDir).Append('\0');
        sb.Append("TMP=").Append(tempDir).Append('\0');
        sb.Append('\0');
        return Marshal.StringToHGlobalUni(sb.ToString());
    }
}
"@

function Quote-Arg([string]$a) {
  if ($a -match '[\s"]') {
    return '"' + $a.Replace('"', '\"') + '"'
  }
  return $a
}

function Set-DirectoryAccess {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$SidString,
    [Parameter(Mandatory = $true)][uint32]$Access,
    [Parameter(Mandatory = $true)][bool]$Grant
  )
  try {
    $acl = Get-Acl -LiteralPath $Path
    $identity = [System.Security.Principal.SecurityIdentifier]::new($SidString)
    $rights = [System.Security.AccessControl.FileSystemRights]$Access
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
    $propagation = [System.Security.AccessControl.PropagationFlags]::None
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
      $identity, $rights, $inheritance, $propagation,
      [System.Security.AccessControl.AccessControlType]::Allow)
    if ($Grant) {
      [void]$acl.AddAccessRule($rule)
    } else {
      [void]$acl.RemoveAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl | Out-Null
  } catch {
    [Console]::Error.WriteLine("Set-DirectoryAccess($Path): $($_.Exception.Message)")
    return 1
  }
  return 0
}

function Get-ProjectAccess([string]$mode) {
  if ($mode -eq 'workspace-write') {
    return 0x001F01FF # FullControl: read + write + execute
  }
  return 0x00120089 -bor 0x001200A0 # read + execute only
}

# Kill-safe cleanup mode: spawned as a detached watcher before grants, so
# even if the parent process is terminated (runner timeout), the temporary
# AppContainer ACLs are revoked and the profile is deleted.
if ($CleanupOnly) {
  $cleanupLog = Join-Path $userTemp ($CleanupOnly + '.cleanup.log')
  try {
    Start-Sleep -Milliseconds 300
    if ($WaitPid -gt 0) {
      Wait-Process -Id $WaitPid -ErrorAction SilentlyContinue | Out-Null
    }
    if ($CleanupSidString) {
      if ($CleanupProjectRoot -and (Test-Path -LiteralPath $CleanupProjectRoot)) {
        $hr = Set-DirectoryAccess -Path $CleanupProjectRoot -SidString $CleanupSidString -Access (Get-ProjectAccess $CleanupMode) -Grant $false
        if ($hr -ne 0) { [Console]::Error.WriteLine("SANDBOX_CLEANUP_WARN: restore ProjectRoot failed: $hr") }
      }
      if ($CleanupWriteDir -and (Test-Path -LiteralPath $CleanupWriteDir)) {
        $hr = Set-DirectoryAccess -Path $CleanupWriteDir -SidString $CleanupSidString -Access 0x001F01FF -Grant $false
        if ($hr -ne 0) { [Console]::Error.WriteLine("SANDBOX_CLEANUP_WARN: restore WriteDir failed: $hr") }
      }
    }
    [void][AuraxisAppContainer]::DeleteAppContainerProfile($CleanupOnly)
  } catch {
    [IO.File]::AppendAllText($cleanupLog, "ERROR: $($_.Exception.ToString())`n")
    [Console]::Error.WriteLine("SANDBOX_CLEANUP_ERROR: $($_.Exception.Message)")
  }
  exit 0
}

$child = $ChildArgvJson | ConvertFrom-Json
if ($child -is [string]) { $child = @($child) }
if ($child.Count -lt 1) {
  [Console]::Error.WriteLine("SANDBOX_LAUNCH_ERROR: empty child argv")
  exit 126
}
$commandLine = (($child | ForEach-Object { Quote-Arg ([string]$_) }) -join ' ')

$profileName = 'AuraxisSandbox-' + [guid]::NewGuid().ToString('N')
$ownToken = [IntPtr]::Zero
$containerToken = [IntPtr]::Zero
$containerSid = [IntPtr]::Zero
$containerSidString = $null
$envBlock = [IntPtr]::Zero
$grantedRead = $false
$grantedWrite = $false

try {
  # 1) AppContainer profile + SID
  $hr = [AuraxisAppContainer]::CreateAppContainerProfile($profileName, 'Auraxis Sandbox', 'Auraxis native AppContainer sandbox', [IntPtr]::Zero, 0, [ref]$containerSid)
  if ($hr -ne 0) {
    throw "CreateAppContainerProfile failed: $hr"
  }
  $containerSidString = [AuraxisAppContainer]::SidToString($containerSid)
  if (-not $containerSidString) {
    throw "SidToString failed: $([AuraxisAppContainer]::GetLastError())"
  }

  # Detached cleanup watchdog — survives TerminateProcess of this script.
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    '-CleanupOnly', $profileName,
    '-WaitPid', $PID,
    '-CleanupProjectRoot', $ProjectRoot,
    '-CleanupWriteDir', $WriteDir,
    '-CleanupSidString', $containerSidString,
    '-CleanupMode', $Mode
  ) -WorkingDirectory $userTemp | Out-Null

  # 2) Container token from the current process token
  if (-not [AuraxisAppContainer]::OpenProcessToken([AuraxisAppContainer]::GetCurrentProcess(), 0x000F01FF, [ref]$ownToken)) {
    throw "OpenProcessToken failed: $([AuraxisAppContainer]::GetLastError())"
  }
  if (-not [AuraxisAppContainer]::CreateContainerToken($ownToken, $containerSid, [ref]$containerToken)) {
    throw "CreateAppContainerToken failed: $([AuraxisAppContainer]::GetLastError())"
  }

  # 3) Write dir for the container (TEMP + scratch)
  New-Item -ItemType Directory -Path $WriteDir -Force | Out-Null
  $hr = Set-DirectoryAccess -Path $WriteDir -SidString $containerSidString -Access 0x001F01FF -Grant $true
  if ($hr -ne 0) { throw "grant WriteDir failed: $hr" }
  $grantedWrite = $true

  # 4) Temporary read+execute grant on the project root (restored in finally)
  if ($ProjectRoot -and (Test-Path -LiteralPath $ProjectRoot)) {
    $projectAccess = Get-ProjectAccess $Mode
    $hr = Set-DirectoryAccess -Path $ProjectRoot -SidString $containerSidString -Access $projectAccess -Grant $true
    if ($hr -ne 0) { throw "grant ProjectRoot failed: $hr" }
    $grantedRead = $true
  }

  # 5) Environment with container-writable TEMP
  $envBlock = [AuraxisAppContainer]::BuildEnvWithTemp($WriteDir)

  $code = [AuraxisAppContainer]::LaunchContainer($commandLine, $Cwd, $containerToken, $envBlock)
  if ($code -lt 0) {
    throw "CreateProcessAsUserW failed: $(-$code)"
  }
  exit $code
}
catch {
  [Console]::Error.WriteLine("SANDBOX_LAUNCH_ERROR: $($_.Exception.Message)")
  exit 126
}
finally {
  if ($envBlock -ne [IntPtr]::Zero) { [System.Runtime.InteropServices.Marshal]::FreeHGlobal($envBlock) }
  if ($grantedRead -and $ProjectRoot -and (Test-Path -LiteralPath $ProjectRoot)) {
    $hr = Set-DirectoryAccess -Path $ProjectRoot -SidString $containerSidString -Access (Get-ProjectAccess $Mode) -Grant $false
    if ($hr -ne 0) { [Console]::Error.WriteLine("SANDBOX_WARN: restore ProjectRoot ACL failed: $hr") }
  }
  if ($grantedWrite) {
    $hr = Set-DirectoryAccess -Path $WriteDir -SidString $containerSidString -Access 0x001F01FF -Grant $false
    if ($hr -ne 0) { [Console]::Error.WriteLine("SANDBOX_WARN: restore WriteDir ACL failed: $hr") }
  }
  if ($containerToken -ne [IntPtr]::Zero) { [void][AuraxisAppContainer]::CloseHandle($containerToken) }
  if ($ownToken -ne [IntPtr]::Zero) { [void][AuraxisAppContainer]::CloseHandle($ownToken) }
  [AuraxisAppContainer]::DeleteAppContainerProfile($profileName) | Out-Null
}

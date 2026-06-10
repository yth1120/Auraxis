param(
  [Parameter(Mandatory = $true)][string]$ChildArgvJson,
  [Parameter(Mandatory = $true)][string]$Cwd
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Add-Type's csc can fail with "未能找到源文件" when TEMP resolves to
# C:\WINDOWS\TEMP (elevated sessions) — point it at a user-writable temp dir.
$userTemp = Join-Path $env:USERPROFILE 'AppData\Local\Temp'
if (-not (Test-Path -LiteralPath $userTemp)) {
  New-Item -ItemType Directory -Path $userTemp -Force | Out-Null
}
$env:TEMP = $userTemp
$env:TMP = $userTemp

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class AuraxisSandbox
{
    [StructLayout(LayoutKind.Sequential)]
    public struct SID_AND_ATTRIBUTES
    {
        public IntPtr Sid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct LUID
    {
        public uint LowPart;
        public int HighPart;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct LUID_AND_ATTRIBUTES
    {
        public LUID Luid;
        public uint Attributes;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct TOKEN_MANDATORY_LABEL
    {
        public SID_AND_ATTRIBUTES Label;
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

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool ConvertStringSidToSidW(string StringSid, out IntPtr Sid);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool LookupPrivilegeValueW(string lpSystemName, string lpName, out LUID lpLuid);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool CreateRestrictedToken(
        IntPtr ExistingTokenHandle,
        uint Flags,
        int DisableSidCount,
        SID_AND_ATTRIBUTES[] SidsToDisable,
        int DeletePrivilegeCount,
        LUID_AND_ATTRIBUTES[] PrivilegesToDelete,
        int RestrictedSidCount,
        IntPtr SidsToRestrict,
        out IntPtr NewTokenHandle);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern bool SetTokenInformation(
        IntPtr TokenHandle,
        int TokenInformationClass,
        IntPtr TokenInformation,
        uint TokenInformationLength);

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

    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool CreateEnvironmentBlock(out IntPtr lpEnvironment, IntPtr hToken, bool bInherit);

    [DllImport("userenv.dll", SetLastError = true)]
    public static extern bool DestroyEnvironmentBlock(IntPtr lpEnvironment);

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

    private static readonly string[] DANGEROUS_PRIVILEGES = new string[]
    {
        "SeDebugPrivilege", "SeTakeOwnershipPrivilege", "SeLoadDriverPrivilege",
        "SeBackupPrivilege", "SeRestorePrivilege", "SeShutdownPrivilege",
        "SeIncreaseQuotaPrivilege", "SeTcbPrivilege", "SeSecurityPrivilege",
        "SeAssignPrimaryTokenPrivilege", "SeImpersonatePrivilege", "SeCreateTokenPrivilege",
        "SeLockMemoryPrivilege", "SeProfileSingleProcessPrivilege", "SeSystemProfilePrivilege",
        "SeManageVolumePrivilege"
    };

    public static bool CreateRestrictedTokenSafe(IntPtr existing, out IntPtr token)
    {
        token = IntPtr.Zero;
        IntPtr admin;
        if (!ConvertStringSidToSidW("S-1-5-32-544", out admin)) return false;
        SID_AND_ATTRIBUTES[] sids = new SID_AND_ATTRIBUTES[1];
        sids[0].Sid = admin;
        sids[0].Attributes = 0x00000010; // SE_GROUP_USE_FOR_DENY_ONLY

        List<LUID_AND_ATTRIBUTES> dels = new List<LUID_AND_ATTRIBUTES>();
        foreach (string name in DANGEROUS_PRIVILEGES)
        {
            LUID luid;
            if (LookupPrivilegeValueW(null, name, out luid))
            {
                LUID_AND_ATTRIBUTES item = new LUID_AND_ATTRIBUTES();
                item.Luid = luid;
                item.Attributes = 0;
                dels.Add(item);
            }
        }
        LUID_AND_ATTRIBUTES[] arr = dels.ToArray();
        return CreateRestrictedToken(existing, 0, 1, sids, arr.Length, arr, 0, IntPtr.Zero, out token);
    }

    public static bool SetMediumIntegrity(IntPtr token)
    {
        IntPtr medium;
        if (!ConvertStringSidToSidW("S-1-16-8192", out medium)) return false;
        TOKEN_MANDATORY_LABEL label = new TOKEN_MANDATORY_LABEL();
        label.Label.Sid = medium;
        label.Label.Attributes = 0x00000020; // SE_GROUP_INTEGRITY
        int size = Marshal.SizeOf(label);
        IntPtr ptr = Marshal.AllocHGlobal(size);
        try
        {
            Marshal.StructureToPtr(label, ptr, false);
            return SetTokenInformation(token, 25, ptr, (uint)size);
        }
        finally
        {
            Marshal.FreeHGlobal(ptr);
        }
    }

    public static IntPtr CreateSandboxJob()
    {
        IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return IntPtr.Zero;
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        // KILL_ON_JOB_CLOSE | ACTIVE_PROCESS. JOB_MEMORY is omitted — it returns
        // ERROR_INVALID_PARAMETER on some Windows builds.
        limits.LimitFlags = 0x00002000 | 0x00000008;
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

    /// <summary>Launch under the restricted token inside a Job Object and wait.</summary>
    /// <returns>Child exit code, or a negative Win32 error on launch failure.</returns>
    public static int LaunchRestricted(string commandLine, string cwd, IntPtr token, IntPtr env)
    {
        IntPtr job = CreateSandboxJob();
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        si.dwFlags = 0x00000100; // STARTF_USESTDHANDLES
        si.hStdInput = GetStdHandle(-10);
        si.hStdOutput = GetStdHandle(-11);
        si.hStdError = GetStdHandle(-12);

        uint flags = 0x00000004 | 0x00000200; // CREATE_SUSPENDED | CREATE_NEW_PROCESS_GROUP
        if (env != IntPtr.Zero) flags |= 0x00000400; // CREATE_UNICODE_ENVIRONMENT

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
}
"@

$child = $ChildArgvJson | ConvertFrom-Json
if ($child -is [string]) { $child = @($child) }
if ($child.Count -lt 1) {
  [Console]::Error.WriteLine("SANDBOX_LAUNCH_ERROR: empty child argv")
  exit 126
}

function Quote-Arg([string]$a) {
  if ($a -match '[\s"]') {
    return '"' + $a.Replace('"', '\"') + '"'
  }
  return $a
}
$commandLine = (($child | ForEach-Object { Quote-Arg ([string]$_) }) -join ' ')

$ownToken = [IntPtr]::Zero
$restricted = [IntPtr]::Zero
$envBlock = [IntPtr]::Zero

try {
  if (-not [AuraxisSandbox]::OpenProcessToken([AuraxisSandbox]::GetCurrentProcess(), 0x000F01FF, [ref]$ownToken)) {
    throw "OpenProcessToken failed: $([AuraxisSandbox]::GetLastError())"
  }
  if (-not [AuraxisSandbox]::CreateRestrictedTokenSafe($ownToken, [ref]$restricted)) {
    throw "CreateRestrictedToken failed: $([AuraxisSandbox]::GetLastError())"
  }
  if (-not [AuraxisSandbox]::SetMediumIntegrity($restricted)) {
    throw "SetMediumIntegrity failed: $([AuraxisSandbox]::GetLastError())"
  }
  if ([AuraxisSandbox]::CreateEnvironmentBlock([ref]$envBlock, $restricted, $false)) {
    # keep envBlock
  } else {
    $envBlock = [IntPtr]::Zero
  }

  $code = [AuraxisSandbox]::LaunchRestricted($commandLine, $Cwd, $restricted, $envBlock)
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
  if ($envBlock -ne [IntPtr]::Zero) { [AuraxisSandbox]::DestroyEnvironmentBlock($envBlock) | Out-Null }
  if ($restricted -ne [IntPtr]::Zero) { [AuraxisSandbox]::CloseHandle($restricted) | Out-Null }
  if ($ownToken -ne [IntPtr]::Zero) { [AuraxisSandbox]::CloseHandle($ownToken) | Out-Null }
}

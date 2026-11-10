# Reads a path's attributes and owner + DACL through ONE handle opened with FILE_FLAG_OPEN_REPARSE_POINT, so a link
# is never followed and the attributes and descriptor describe the same object. Dot-source; do not run.

if (-not ('HcNoFollow' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public class HcPathInfo { public uint Attributes; public byte[] Descriptor; }

public static class HcNoFollow {
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr sa, uint disposition, uint flags, IntPtr template);
    [StructLayout(LayoutKind.Sequential)]
    struct Info { public uint Attributes, C1, C2, A1, A2, W1, W2, Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow; }
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetFileInformationByHandle(SafeFileHandle h, out Info info);
    [DllImport("advapi32.dll")]
    static extern uint GetSecurityInfo(SafeFileHandle h, int type, uint info, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr sd);
    [DllImport("advapi32.dll")]
    static extern uint GetSecurityDescriptorLength(IntPtr sd);
    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr p);

    const uint ReadControl = 0x20000, ReadAttributes = 0x80, ShareAll = 7, OpenExisting = 3;
    const uint BackupSemantics = 0x02000000, OpenReparsePoint = 0x00200000;
    const uint OwnerInfo = 1, DaclInfo = 4;

    // null when the path does not exist.
    public static HcPathInfo Read(string path) {
        SafeFileHandle h = CreateFileW(path, ReadControl | ReadAttributes, ShareAll, IntPtr.Zero, OpenExisting, BackupSemantics | OpenReparsePoint, IntPtr.Zero);
        if (h.IsInvalid) {
            int e = Marshal.GetLastWin32Error();
            if (e == 2 || e == 3) return null;
            throw new Win32Exception(e, "Cannot open " + path);
        }
        using (h) {
            Info info;
            if (!GetFileInformationByHandle(h, out info)) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read attributes of " + path);
            IntPtr o, g, d, s, sd;
            uint rc = GetSecurityInfo(h, 1, OwnerInfo | DaclInfo, out o, out g, out d, out s, out sd);
            if (rc != 0) throw new Win32Exception((int)rc, "Cannot read the security of " + path);
            try {
                byte[] b = new byte[GetSecurityDescriptorLength(sd)];
                Marshal.Copy(sd, b, 0, b.Length);
                return new HcPathInfo { Attributes = info.Attributes, Descriptor = b };
            } finally { LocalFree(sd); }
        }
    }
}
'@
}

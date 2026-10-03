# Assembles "Berzerk (decomp).asm" (Dennis Debro's disassembly) with DASM and
# checks the result's MD5. Output: tools/build/berzerk.{bin,lst,sym}
# (git-ignored), and rom/berzerk.a26 for the oracle. Needs DASM 2.20.17 with
# vcs.h and macro.h in tools/dasm.
#
# Two adjustments for current DASM; the source itself is not changed:
# - macro.h's BOUNDARY now pads to a multiple of N (so "BOUNDARY 0" divides by
#   zero); the disassembly means "pad to byte N of the page", as macro.h's own
#   comment describes, so the build copy defines it that way with ds
# - "<A-B" low-byte expressions that come out negative are rejected; they are
#   written as "[A-B] & $FF", the low byte of the whole expression
#   (the same fix reproduces the Donkey Kong cartridge byte for byte)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Force $out | Out-Null

# DASM runs in a temp folder because Windows' Controlled Folder Access stops
# it writing under Documents; the results are copied back afterwards
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'berzerk-rom-build'
New-Item -ItemType Directory -Force $tmp | Out-Null

$src = [IO.File]::ReadAllText((Join-Path $root 'Berzerk (decomp).asm'), [Text.Encoding]::GetEncoding(28591))
$pattern = '(\.byte\s+|#)<([A-Za-z_.][\w.]*\s*-\s*[A-Za-z_.][\w.]*(?:\s*[+-]\s*\d+)?)'
$src = [regex]::Replace($src, $pattern, { param($m) $m.Groups[1].Value + '[' + $m.Groups[2].Value.Trim() + '] & $FF' })
[IO.File]::WriteAllText((Join-Path $tmp 'berzerk.asm'), $src, [Text.Encoding]::GetEncoding(28591))

$macro = Get-Content (Join-Path $PSScriptRoot 'dasm\macro.h') -Raw
$macro = [regex]::Replace($macro, '(?s)    MAC BOUNDARY.*?    ENDM', "    MAC BOUNDARY`n        ds [[{1} - <.] & `$FF], 0`n    ENDM")
Set-Content -Path (Join-Path $tmp 'macro.h') -Value $macro -NoNewline -Encoding ascii
Copy-Item (Join-Path $PSScriptRoot 'dasm\vcs.h') $tmp -Force

Push-Location $tmp
try {
  # passed as an array: PowerShell mangles some DASM flags written inline
  $dasmArgs = @('berzerk.asm', '-f3', '-oberzerk.bin', '-lberzerk.lst', '-sberzerk.sym')
  & (Join-Path $PSScriptRoot 'dasm\dasm.exe') @dasmArgs
  if ($LASTEXITCODE -ne 0) { throw "DASM failed ($LASTEXITCODE)" }
} finally { Pop-Location }
Copy-Item (Join-Path $tmp 'berzerk.bin'), (Join-Path $tmp 'berzerk.lst'), (Join-Path $tmp 'berzerk.sym') $out -Force

$md5 = (Get-FileHash (Join-Path $out 'berzerk.bin') -Algorithm MD5).Hash.ToLower()
if ($md5 -ne '136f75c4dd02c29283752b7e5799f978') { throw "assembled ROM MD5 $md5 does not match the cartridge" }
New-Item -ItemType Directory -Force (Join-Path $root 'rom') | Out-Null
Copy-Item (Join-Path $out 'berzerk.bin') (Join-Path $root 'rom\berzerk.a26') -Force
"OK: tools/build/berzerk.bin ($md5)"

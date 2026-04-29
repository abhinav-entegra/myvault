; Cloud row removal before roaming data deletion (paired with nsis.deleteAppDataOnUninstall).
!macro customUnInstall
  IfFileExists "$INSTDIR\Myvault.exe" 0 +2
    ExecWait '"$INSTDIR\Myvault.exe" --uninstall-purge-cloud'
!macroend

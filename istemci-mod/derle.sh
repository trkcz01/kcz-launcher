#!/usr/bin/env bash
# KCZ Client modunu desteklenen her Minecraft sürümü için derler (Linux/macOS).
# istemci-mod/cikti/kcz-client-<sürüm>.jar -> launcher derlenirken içine gömülür.
set -u
cd "$(dirname "$0")"
KAYIT="../mod-derleme-kaydi.txt"
: > "$KAYIT"
mkdir -p cikti
basarili=0
for cift in "26.2 0.161.0+26.2" "26.3 0.161.0+26.3"; do
  set -- $cift
  mc=$1; fapi=$2
  echo "       KCZ Client $mc derleniyor..."
  echo "===== $mc =====" >> "$KAYIT"
  if ./gradlew build --no-daemon "-Pmc=$mc" "-Pfapi=$fapi" >> "$KAYIT" 2>&1; then
    jar=$(ls build/libs/kcz-client-*+"$mc".jar 2>/dev/null | grep -v sources | head -1)
    if [ -n "$jar" ]; then cp "$jar" "cikti/kcz-client-$mc.jar"; basarili=$((basarili+1)); fi
  else
    echo "  [!] KCZ Client $mc derlenemedi (mod-derleme-kaydi.txt)."
  fi
done
echo "       KCZ Client: $basarili/2 sürüm hazır."
exit 0

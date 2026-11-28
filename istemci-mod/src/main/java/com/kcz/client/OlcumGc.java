package com.kcz.client;

import java.lang.management.ManagementFactory;
import java.util.function.BiConsumer;

import javax.management.NotificationEmitter;
import javax.management.openmbean.CompositeData;

import com.sun.management.GarbageCollectionNotificationInfo;

/**
 * Bellek temizliği (GC) duraklamalarını dinler: her duraklamanın başladığı an ve süresi.
 * Ayrı sınıf: com.sun.management (jdk.management) bazı Java kurulumlarında yoksa sadece burası
 * yüklenemez, ölçümün geri kalanı çalışır. Eşzamanlı çalışan (oyunu durdurmayan) evreler sayılmaz.
 */
final class OlcumGc {
	private OlcumGc() {
	}

	static void kur(BiConsumer<Long, Long> kaydet) {
		long jvmBas = ManagementFactory.getRuntimeMXBean().getStartTime();
		for (var b : ManagementFactory.getGarbageCollectorMXBeans()) {
			if (!(b instanceof NotificationEmitter e)) continue;
			e.addNotificationListener((n, h) -> {
				if (!GarbageCollectionNotificationInfo.GARBAGE_COLLECTION_NOTIFICATION.equals(n.getType())) return;
				GarbageCollectionNotificationInfo info = GarbageCollectionNotificationInfo.from((CompositeData) n.getUserData());
				String ad = info.getGcName();
				// ZGC "Cycles" ve G1 "Concurrent": oyunla aynı anda çalışır, kareyi durdurmaz
				if (ad.contains("Cycles") || ad.contains("Concurrent")) return;
				var gi = info.getGcInfo();
				kaydet.accept(jvmBas + gi.getStartTime(), gi.getDuration());
			}, null, null);
		}
	}
}

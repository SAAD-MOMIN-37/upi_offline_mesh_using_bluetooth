"""
Port of VirtualDevice.java + MeshSimulatorService.java.

Simulates the Bluetooth mesh. Each VirtualDevice represents a phone. The
"gossip" step picks pairs of devices that are nearby (we just say all
devices are nearby for the demo) and copies packets between them,
decrementing TTL each hop.

When a device with internet (a "bridge node") holds a packet, /api/mesh/flush
causes it to actually POST that packet to our backend — simulating the
moment a phone walks outside and gets 4G.

MeshPacket here is a plain dict with keys: packetId, ttl, createdAt,
ciphertext — matching the JSON shape the dashboard JS already expects.
"""
import threading
from typing import Optional

from .event_log import MeshEventLog


class VirtualDevice:
    def __init__(self, device_id: str, has_internet: bool):
        self.device_id = device_id
        self.has_internet = has_internet
        self._held: dict[str, dict] = {}
        self._lock = threading.Lock()

    def hold(self, packet: dict) -> None:
        with self._lock:
            self._held.setdefault(packet["packetId"], packet)

    def held_packets(self) -> list[dict]:
        with self._lock:
            return list(self._held.values())

    def holds(self, packet_id: str) -> bool:
        with self._lock:
            return packet_id in self._held

    def packet_count(self) -> int:
        with self._lock:
            return len(self._held)

    def clear(self) -> None:
        with self._lock:
            self._held.clear()


class MeshSimulatorService:
    def __init__(self, event_log: Optional[MeshEventLog] = None):
        self.devices: dict[str, VirtualDevice] = {}
        self.event_log = event_log
        self._seed_default_devices()

    def _seed_default_devices(self):
        # Default scenario: 4 offline phones in a basement, 1 phone outside with 4G.
        self.devices["phone-alice"] = VirtualDevice("phone-alice", False)
        self.devices["phone-stranger1"] = VirtualDevice("phone-stranger1", False)
        self.devices["phone-stranger2"] = VirtualDevice("phone-stranger2", False)
        self.devices["phone-stranger3"] = VirtualDevice("phone-stranger3", False)
        self.devices["phone-bridge"] = VirtualDevice("phone-bridge", True)

    def get_device(self, device_id: str) -> Optional[VirtualDevice]:
        return self.devices.get(device_id)

    def inject(self, sender_device_id: str, packet: dict) -> None:
        """Sender drops a packet into the mesh by handing it to their own device."""
        device = self.devices.get(sender_device_id)
        if device is None:
            raise ValueError(f"Unknown device: {sender_device_id}")
        device.hold(packet)

    def gossip_once(self):
        """
        One round of gossip. Every device shares everything it has with every
        other device. TTL is decremented per hop; packets at TTL 0 stay where
        they are but are not forwarded further.

        Real BLE gossip would be pair-by-pair when devices come into range.
        For the demo we let everyone gossip with everyone in one round, which
        is equivalent to "fast-forward N rounds of pairwise gossip".
        """
        transfers = 0
        device_list = list(self.devices.values())

        # Snapshot what each device holds at the start of this round, so we
        # don't gossip the same packet through 5 devices in 1 step.
        snapshot = {d.device_id: d.held_packets() for d in device_list}

        for src in device_list:
            for pkt in snapshot[src.device_id]:
                if pkt["ttl"] <= 0:
                    continue
                for dst in device_list:
                    if dst is src:
                        continue
                    if dst.holds(pkt["packetId"]):
                        continue
                    copy = dict(pkt)
                    copy["ttl"] = pkt["ttl"] - 1
                    dst.hold(copy)
                    transfers += 1
                    if self.event_log:
                        self.event_log.log_gossip_hop(
                            packet_id=pkt["packetId"],
                            from_device=src.device_id,
                            to_device=dst.device_id,
                            ttl=copy["ttl"],
                        )

        return transfers, self.snapshot_map()

    def snapshot_map(self) -> dict[str, int]:
        return {d.device_id: d.packet_count() for d in self.devices.values()}

    def collect_bridge_uploads(self) -> list[tuple[str, dict]]:
        """
        Returns (bridge_node_id, packet) for every packet held by devices
        with internet — what would be uploaded to the backend the moment
        they reach connectivity.
        """
        out = []
        for d in self.devices.values():
            if not d.has_internet:
                continue
            for pkt in d.held_packets():
                out.append((d.device_id, pkt))
        return out

    def reset_mesh(self) -> None:
        for d in self.devices.values():
            d.clear()

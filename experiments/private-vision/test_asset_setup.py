import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare_assets import acquire


class AssetSetupTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.directory = Path(self.folder.name)
        self.payload = b'fixed synthetic test asset'
        self.spec = {'name': 'fixture.bin', 'bytes': len(self.payload),
                     'sha256': hashlib.sha256(self.payload).hexdigest(),
                     'source_url': 'https://example.invalid/fixed-revision/fixture.bin'}

    def transfer(self, command, **kwargs):
        self.assertTrue(kwargs['check'])
        self.assertIn('--fail', command)
        self.assertNotIn('--insecure', command)
        self.assertNotIn('-k', command)
        self.assertEqual(command[command.index('--proto') + 1], '=https')
        self.assertEqual(command[command.index('--proto-redir') + 1], '=https')
        self.assertEqual(command[-1], self.spec['source_url'])
        Path(command[command.index('--output') + 1]).write_bytes(self.payload)

    @patch('prepare_assets.shutil.which', return_value='/usr/bin/curl')
    def test_verified_transfer_keeps_tls_and_fixed_hash(self, _):
        with patch('prepare_assets.subprocess.run', side_effect=self.transfer) as transfer:
            acquire(self.spec, self.directory)
            self.assertEqual(transfer.call_count, 1)
        self.assertEqual((self.directory / self.spec['name']).read_bytes(), self.payload)
        self.assertFalse(list(self.directory.glob('*.partial')))

    def test_retained_verified_file_needs_no_downloader(self):
        (self.directory / self.spec['name']).write_bytes(self.payload)
        with patch('prepare_assets.subprocess.run') as transfer:
            acquire(self.spec, self.directory)
            transfer.assert_not_called()

    @patch('prepare_assets.shutil.which', return_value='/usr/bin/curl')
    def test_failed_transfer_cleans_partial_and_never_publishes(self, _):
        def failed(command, **kwargs):
            Path(command[command.index('--output') + 1]).write_bytes(b'partial')
            raise subprocess.CalledProcessError(22, command)
        with patch('prepare_assets.subprocess.run', side_effect=failed):
            with self.assertRaises(subprocess.CalledProcessError):
                acquire(self.spec, self.directory)
        self.assertEqual(list(self.directory.iterdir()), [])

    @patch('prepare_assets.shutil.which', return_value='/usr/bin/curl')
    def test_changed_download_fails_checksum(self, _):
        def changed(command, **kwargs):
            Path(command[command.index('--output') + 1]).write_bytes(b'x' * len(self.payload))
        with patch('prepare_assets.subprocess.run', side_effect=changed):
            with self.assertRaisesRegex(RuntimeError, 'checksum mismatch'):
                acquire(self.spec, self.directory)
        self.assertEqual(list(self.directory.iterdir()), [])


if __name__ == '__main__':
    unittest.main()

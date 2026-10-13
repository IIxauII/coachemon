import json,sys
for k,v in json.load(sys.stdin).items(): print('  ',k.ljust(12),v['pick'].ljust(13),('KO:'+','.join(v['ko'])).ljust(16),v['scores'])

import urllib.request
import re
src = urllib.request.urlopen('https://js.stripe.com/v3/').read().decode('utf-8')
matches = re.findall(r'Invalid API Key provided:.*', src)
print('Matches:', matches)

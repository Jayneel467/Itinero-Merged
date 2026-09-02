import urllib.request
import json

req = urllib.request.Request("https://payment-wrapper.liteapi.travel/config", method="POST")
req.add_header("Content-Type", "application/json")
req.add_header("Accept", "application/json")

try:
    response = urllib.request.urlopen(req, data=b'{"publicKey":"sandbox"}')
    data = response.read()
    print(json.loads(data.decode("utf-8")))
except Exception as e:
    print(e)

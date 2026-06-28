import requests

try:
    requests.get('http://localhost:8000')
    print("Server is reachable")
except:
    print("Server not reachable")

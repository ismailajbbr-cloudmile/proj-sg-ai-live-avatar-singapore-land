# Source - https://stackoverflow.com/a
# Posted by Chris, modified by community. See post 'Timeline' for change history
# Retrieved 2025-12-25, License - CC BY-SA 4.0
# test on set session and get session
# uv run uvicorn app.tests.session_middleware:app --host 0.0.0.0 --port 5003 --reload

from fastapi import FastAPI, Request
from starlette.middleware.sessions import SessionMiddleware
import random

app = FastAPI()
app.add_middleware(SessionMiddleware, secret_key="some-random-string")

# Set your own middleware to set the session cookie
# @app.middleware("http")
# async def some_middleware(request: Request, call_next):
#     response = await call_next(request)
#     session = request.cookies.get('session')
#     if session:
#         response.set_cookie(key='session', value=request.cookies.get('session'), httponly=True)
#     return response
 
@app.get("/a")
def func_a(request: Request):
    random_str = str(random.randint(1, 10))
    request.session["my_var"] = random_str
    print(request.cookies.get('session'))
    return random_str

@app.get("/b")
def func_b(request: Request):
    my_var = request.session.get("my_var", None)
    print(request.cookies.get('session'))
    return my_var

# Staging values Terraform loads automatically, so a plain plan/apply keeps them.
# Both services exist; leaving these false would plan to delete them.
create_api = true
create_web = true

# Google sign-in OAuth client ids (public values, not secrets): web + Android.
google_oauth_client_ids = "542534084220-dkulc04guq24btte9vc7b37gom7h2df0.apps.googleusercontent.com,542534084220-8eh8ru5aeum5in1esendnuv4hlcvbjk3.apps.googleusercontent.com"
google_web_client_id    = "542534084220-dkulc04guq24btte9vc7b37gom7h2df0.apps.googleusercontent.com"

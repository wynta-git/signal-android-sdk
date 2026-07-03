require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "SignalSDK"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/signal-sdk/react-native-sdk"
  s.license      = package["license"]
  s.authors      = { "Signal" => "support@signal-sdk.com" }
  s.platforms    = { :ios => "12.4" }
  s.source       = { :git => "https://github.com/signal-sdk/react-native-sdk.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
end

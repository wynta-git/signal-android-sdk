require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "WyntaSDK"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://wynta.com"
  s.license      = package["license"]
  s.authors      = { "Wynta" => "support@wynta.com" }
  s.platforms    = { :ios => "12.4" }
  s.source       = { :git => "https://github.com/wyntasoftware/pam.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
end

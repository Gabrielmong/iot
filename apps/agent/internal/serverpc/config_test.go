package serverpc

import "testing"

func TestConfigPathFromParams(t *testing.T) {
	got, ok := ConfigPathFromParams(`C:\HomeControl\deployer\app\dist\main.js C:\HomeControl\deployer\deployer.json`)
	if !ok || got != `C:\HomeControl\deployer\deployer.json` {
		t.Fatalf("got %q %v", got, ok)
	}
	if _, ok := ConfigPathFromParams(""); ok {
		t.Fatal("empty params gave a path")
	}
	if _, ok := ConfigPathFromParams(`C:\x\main.js`); ok {
		t.Fatal("params without a config gave a path")
	}
}

func TestParseConfigAppliesDefaults(t *testing.T) {
	c, err := ParseConfig([]byte(`{"root":"C:\\HomeControl","githubRepo":"x"}`))
	if err != nil {
		t.Fatal(err)
	}
	if c != (Config{Root: `C:\HomeControl`, APIPort: 4100, ServiceName: "HomeControl"}) {
		t.Fatalf("got %+v", c)
	}
	if c.TokenFile() != `C:\HomeControl\deployer\api-token` {
		t.Fatalf("token file %s", c.TokenFile())
	}
	if c.URL() != "http://127.0.0.1:4100" {
		t.Fatalf("url %s", c.URL())
	}
}

func TestParseConfigKeepsValues(t *testing.T) {
	c, err := ParseConfig([]byte(`{"root":"D:\\H","apiPort":4200,"serviceName":"X"}`))
	if err != nil || c.APIPort != 4200 || c.ServiceName != "X" {
		t.Fatalf("got %+v %v", c, err)
	}
}

func TestParseConfigNeedsRoot(t *testing.T) {
	if _, err := ParseConfig([]byte(`{"apiPort":4200}`)); err == nil {
		t.Fatal("no error without root")
	}
	if _, err := ParseConfig([]byte(`not json`)); err == nil {
		t.Fatal("no error for bad json")
	}
}
